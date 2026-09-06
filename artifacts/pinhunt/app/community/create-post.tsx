/**
 * Create Community Post screen — with multi-photo support.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { uploadCommunityPhoto } from '@/utils/communityPhoto';
import { radius, spacing } from '@/constants/theme';
import type { CommunityPostType } from '@workspace/pin-repository';

const MAX_PHOTOS = 6;

const POST_TYPES: Array<{ key: CommunityPostType; label: string; icon: React.ComponentProps<typeof Feather>['name']; hint: string }> = [
  { key: 'for_trade',    label: 'Trade',        icon: 'repeat',          hint: 'Offering pins to swap' },
  { key: 'in_search_of', label: 'ISO',          icon: 'search',         hint: 'Looking for specific pins' },
  { key: 'discussion',   label: 'Discussion',   icon: 'message-circle', hint: 'General chat' },
  { key: 'new_pickup',   label: 'Event',        icon: 'package',        hint: 'Share an upcoming event' },
];

export default function CreatePostScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();
  const { pins } = usePinCatalogue();

  // Same category colours as the Community feed badges (constants/colors.ts home* tokens).
  const TYPE_COLOR: Record<CommunityPostType, string> = {
    in_search_of: colors.homeSandInk,
    for_trade:    colors.homeCoral,
    for_sale:     colors.owned,
    new_pickup:   colors.homeCoralDeep,
    discussion:   colors.homeMuted,
  };

  const [postType,    setPostType]    = useState<CommunityPostType>('discussion');
  const [body,        setBody]        = useState('');
  const [linkedPinId, setLinkedPinId] = useState<string | undefined>();
  const [pinSearch,   setPinSearch]   = useState('');
  const [showPins,    setShowPins]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [priceText,    setPriceText]    = useState('');
  const [lookingFor,   setLookingFor]   = useState('');
  const [locationText, setLocationText] = useState('');
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);   // local file URIs
  const [uploadProgress, setUploadProgress] = useState('');

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;
  const selectedPin = linkedPinId ? pins.find(p => p.id === linkedPinId) : undefined;

  const filteredPins = pinSearch.trim()
    ? pins
        .filter(p =>
          p.title.toLowerCase().includes(pinSearch.toLowerCase()) ||
          p.collection.toLowerCase().includes(pinSearch.toLowerCase()),
        )
        .slice(0, 12)
    : [];

  const handlePickPhotos = async () => {
    const remaining = MAX_PHOTOS - localPhotos.length;
    if (remaining <= 0) {
      Alert.alert(`Maximum ${MAX_PHOTOS} photos`, 'Remove a photo to add another.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
      exif: false,
    });

    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setLocalPhotos(prev => [...prev, ...uris].slice(0, MAX_PHOTOS));
    }
  };

  const handleRemovePhoto = (index: number) => {
    setLocalPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!repo || !userId) return;
    if (!body.trim()) { Alert.alert('Please add some content to your post.'); return; }
    try {
      setSaving(true);

      // Upload photos if any
      let photoUrls: string[] = [];
      let failedCount = 0;
      if (localPhotos.length > 0) {
        setUploadProgress(`Uploading photos (0/${localPhotos.length})…`);
        const uploaded: string[] = [];
        for (let i = 0; i < localPhotos.length; i++) {
          setUploadProgress(`Uploading photos (${i + 1}/${localPhotos.length})…`);
          try {
            const url = await uploadCommunityPhoto(userId, localPhotos[i], i);
            uploaded.push(url);
          } catch (err) {
            console.error('[create-post] photo upload failed: ' + (err instanceof Error ? err.message : String(err)));
            failedCount++;
          }
        }
        photoUrls = uploaded;
        setUploadProgress('');
      }

      const tradeDetails = ['for_trade', 'for_sale', 'in_search_of'].includes(postType);
      const post = await repo.createCommunityPost(userId, {
        postType,
        body: body.trim(),
        photos: photoUrls,
        linkedPinId,
        priceText: tradeDetails && priceText.trim() ? priceText.trim() : undefined,
        lookingFor: tradeDetails && lookingFor.trim() ? lookingFor.trim() : undefined,
        locationText: tradeDetails && locationText.trim() ? locationText.trim() : undefined,
      });

      // Navigate first, then surface any photo failures so the user can see the post was saved.
      router.replace({ pathname: '/community/post/[id]' as any, params: { id: post.id } });

      if (failedCount > 0) {
        const saved = localPhotos.length - failedCount;
        const photoWord = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
        Alert.alert(
          'Some photos couldn\'t upload',
          failedCount === localPhotos.length
            ? 'None of your photos could be uploaded. Your post was saved without any photos.'
            : `${photoWord(failedCount)} couldn't be uploaded — post saved with ${photoWord(saved)}.`,
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create post. Try again.');
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'New Post' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Post type selector */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>POST TYPE</Text>
          <View style={styles.typeGrid}>
            {POST_TYPES.map(pt => {
              const active = postType === pt.key;
              const color  = TYPE_COLOR[pt.key];
              return (
                <TouchableOpacity
                  key={pt.key}
                  onPress={() => setPostType(pt.key)}
                  activeOpacity={0.8}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor: active ? color + '18' : colors.homeSurface,
                      borderColor: active ? color : colors.homeLine,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  <Feather name={pt.icon} size={20} color={active ? color : colors.homeMuted} />
                  <Text style={[styles.typeLabel, { color: active ? color : colors.homeInk }]}>
                    {pt.label}
                  </Text>
                  <Text style={[styles.typeHint, { color: active ? color + 'cc' : colors.homeMuted }]}>
                    {pt.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Body */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>WHAT'S ON YOUR MIND?</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share with the community…"
            placeholderTextColor={colors.homeMuted}
            multiline
            maxLength={2000}
            style={[
              styles.bodyInput,
              {
                color: colors.homeInk,
                borderColor: colors.homeLine,
                backgroundColor: colors.homeSurface,
                borderRadius: radius.lg,
              },
            ]}
          />
          <Text style={[styles.charCount, { color: colors.homeMuted }]}>
            {body.length} / 2000
          </Text>

          {/* Trade / sale details (FT, FS, ISO only) */}
          {['for_trade', 'for_sale', 'in_search_of'].includes(postType) && (
            <>
              <Text style={[styles.label, { color: colors.homeMuted }]}>
                {postType === 'for_sale' ? 'ASKING PRICE (OPTIONAL)' : 'TRADE VALUE (OPTIONAL)'}
              </Text>
              <TextInput
                value={priceText}
                onChangeText={setPriceText}
                placeholder={postType === 'for_sale' ? 'e.g. £25 posted' : 'e.g. LE 2500, worth two pins'}
                placeholderTextColor={colors.homeMuted}
                maxLength={80}
                style={[styles.detailInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface, borderRadius: radius.lg }]}
              />
              <Text style={[styles.label, { color: colors.homeMuted }]}>LOOKING FOR (OPTIONAL)</Text>
              <TextInput
                value={lookingFor}
                onChangeText={setLookingFor}
                placeholder="e.g. Stitch, Villains or Disneyland Paris pins"
                placeholderTextColor={colors.homeMuted}
                maxLength={300}
                style={[styles.detailInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface, borderRadius: radius.lg }]}
              />
              <Text style={[styles.label, { color: colors.homeMuted }]}>LOCATION / POSTAGE (OPTIONAL)</Text>
              <TextInput
                value={locationText}
                onChangeText={setLocationText}
                placeholder="e.g. UK postage available"
                placeholderTextColor={colors.homeMuted}
                maxLength={120}
                style={[styles.detailInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface, borderRadius: radius.lg }]}
              />
            </>
          )}

          {/* Photos */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>
            PHOTOS ({localPhotos.length}/{MAX_PHOTOS})
          </Text>
          <View style={styles.photoGrid}>
            {localPhotos.map((uri, idx) => (
              <View key={uri + idx} style={[styles.photoCell, { borderRadius: radius.lg, borderColor: colors.homeLine }]}>
                <Image source={{ uri }} style={styles.photoCellImage} />
                <TouchableOpacity
                  onPress={() => handleRemovePhoto(idx)}
                  style={styles.photoRemoveBtn}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather name="x" size={12} color={colors.homeSurface} />
                </TouchableOpacity>
              </View>
            ))}
            {localPhotos.length < MAX_PHOTOS && (
              <TouchableOpacity
                onPress={handlePickPhotos}
                activeOpacity={0.8}
                style={[
                  styles.photoAddBtn,
                  {
                    backgroundColor: colors.homeAqua,
                    borderColor: colors.homeLine,
                    borderRadius: radius.lg,
                  },
                ]}
              >
                <Feather name="camera" size={22} color={colors.homeMuted} />
                <Text style={[styles.photoAddLabel, { color: colors.homeMuted }]}>Add photos</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Link a pin */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>LINK A PIN (OPTIONAL)</Text>
          {selectedPin ? (
            <View style={[styles.selectedPin, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedPinName, { color: colors.homeInk }]} numberOfLines={1}>
                  {selectedPin.title}
                </Text>
                <Text style={[styles.selectedPinSub, { color: colors.homeMuted }]}>
                  {selectedPin.collection}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setLinkedPinId(undefined); setPinSearch(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={colors.homeMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.pinSearchBar, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}>
                <Feather name="search" size={15} color={colors.homeMuted} />
                <TextInput
                  value={pinSearch}
                  onChangeText={v => { setPinSearch(v); setShowPins(v.length > 1); }}
                  placeholder="Search catalogue pins…"
                  placeholderTextColor={colors.homeMuted}
                  style={[styles.pinSearchInput, { color: colors.homeInk }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {pinSearch.length > 0 && (
                  <TouchableOpacity onPress={() => { setPinSearch(''); setShowPins(false); }}>
                    <Feather name="x" size={14} color={colors.homeMuted} />
                  </TouchableOpacity>
                )}
              </View>
              {showPins && filteredPins.length > 0 && (
                <View style={[styles.pinDropdown, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}>
                  {filteredPins.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setLinkedPinId(p.id); setShowPins(false); setPinSearch(''); }}
                      style={[styles.pinDropdownItem, { borderBottomColor: colors.homeLine }]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.pinDropdownName, { color: colors.homeInk }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={[styles.pinDropdownSub, { color: colors.homeMuted }]}>
                        {p.collection} · {p.brand}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {showPins && filteredPins.length === 0 && pinSearch.length > 1 && (
                <Text style={[styles.noPins, { color: colors.homeMuted }]}>No pins found.</Text>
              )}
            </>
          )}

          {/* Upload progress */}
          {uploadProgress ? (
            <Text style={[styles.uploadProgress, { color: colors.homeMuted }]}>
              {uploadProgress}
            </Text>
          ) : null}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving || !body.trim()}
            activeOpacity={0.85}
            style={[
              styles.submitBtn,
              {
                backgroundColor: body.trim() ? colors.homeCoral : colors.homeAqua,
                borderRadius: radius.lg,
                shadowColor: colors.homeShadow,
              },
            ]}
          >
            {saving
              ? <ActivityIndicator color={colors.homeSurface} size="small" />
              : (
                <>
                  <Feather name="send" size={16} color={body.trim() ? colors.homeSurface : colors.homeMuted} />
                  <Text style={[styles.submitLabel, { color: body.trim() ? colors.homeSurface : colors.homeMuted }]}>
                    Post to Community
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const PHOTO_CELL_SIZE = 96;

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.sm + 2 },
  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: spacing.xs, marginBottom: spacing.xs },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeBtn: {
    width: '48%',
    padding: spacing.md, borderWidth: 1.5, gap: 3,
    flexGrow: 1,
  },
  typeLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  typeHint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },

  bodyInput: {
    borderWidth: 1,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  charCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -6 },

  detailInput: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },

  // Photo grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: PHOTO_CELL_SIZE,
    height: PHOTO_CELL_SIZE,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoCellImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddBtn: {
    width: PHOTO_CELL_SIZE,
    height: PHOTO_CELL_SIZE,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoAddLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },

  uploadProgress: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    textAlign: 'center', marginTop: spacing.xs,
  },

  selectedPin: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderWidth: 1, gap: spacing.sm + 2,
  },
  selectedPinName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selectedPinSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  pinSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  pinSearchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },

  pinDropdown: { borderWidth: 1, overflow: 'hidden' },
  pinDropdownItem: {
    padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinDropdownName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pinDropdownSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  noPins: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -4 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md + 2, marginTop: spacing.xs,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  submitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
