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
import type { CommunityPostType } from '@workspace/pin-repository';

const MAX_PHOTOS = 3;

const POST_TYPES: Array<{ key: CommunityPostType; label: string; emoji: string; hint: string }> = [
  { key: 'in_search_of', label: 'In Search Of', emoji: '🔍', hint: 'Looking for a specific pin' },
  { key: 'for_trade',    label: 'For Trade',    emoji: '🔄', hint: 'Offering a pin to swap' },
  { key: 'for_sale',     label: 'For Sale',     emoji: '🏷️', hint: 'Selling a pin' },
  { key: 'new_pickup',   label: 'New Pickup',   emoji: '📦', hint: 'Show off a recent find' },
  { key: 'discussion',   label: 'Discussion',   emoji: '💬', hint: 'General chat' },
];

const TYPE_COLOR: Record<CommunityPostType, string> = {
  in_search_of: '#F59E0B',
  for_trade:    '#3B82F6',
  for_sale:     '#16A34A',
  new_pickup:   '#8B5CF6',
  discussion:   '#64748B',
};

export default function CreatePostScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();
  const { pins } = usePinCatalogue();

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
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Post type selector */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>POST TYPE</Text>
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
                      backgroundColor: active ? color + '18' : colors.card,
                      borderColor: active ? color : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text style={styles.typeEmoji}>{pt.emoji}</Text>
                  <Text style={[styles.typeLabel, { color: active ? color : colors.foreground }]}>
                    {pt.label}
                  </Text>
                  <Text style={[styles.typeHint, { color: active ? color + 'cc' : colors.mutedForeground }]}>
                    {pt.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Body */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>WHAT'S ON YOUR MIND?</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share with the community…"
            placeholderTextColor={colors.mutedForeground + '88'}
            multiline
            maxLength={2000}
            style={[
              styles.bodyInput,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: colors.radius,
              },
            ]}
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {body.length} / 2000
          </Text>

          {/* Trade / sale details (FT, FS, ISO only) */}
          {['for_trade', 'for_sale', 'in_search_of'].includes(postType) && (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                {postType === 'for_sale' ? 'ASKING PRICE (OPTIONAL)' : 'TRADE VALUE (OPTIONAL)'}
              </Text>
              <TextInput
                value={priceText}
                onChangeText={setPriceText}
                placeholder={postType === 'for_sale' ? 'e.g. £25 posted' : 'e.g. LE 2500, worth two pins'}
                placeholderTextColor={colors.mutedForeground + '88'}
                maxLength={80}
                style={[styles.detailInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>LOOKING FOR (OPTIONAL)</Text>
              <TextInput
                value={lookingFor}
                onChangeText={setLookingFor}
                placeholder="e.g. Stitch, Villains or Disneyland Paris pins"
                placeholderTextColor={colors.mutedForeground + '88'}
                maxLength={300}
                style={[styles.detailInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>LOCATION / POSTAGE (OPTIONAL)</Text>
              <TextInput
                value={locationText}
                onChangeText={setLocationText}
                placeholder="e.g. UK postage available"
                placeholderTextColor={colors.mutedForeground + '88'}
                maxLength={120}
                style={[styles.detailInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
              />
            </>
          )}

          {/* Photos */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            PHOTOS ({localPhotos.length}/{MAX_PHOTOS})
          </Text>
          <View style={styles.photoGrid}>
            {localPhotos.map((uri, idx) => (
              <View key={uri + idx} style={[styles.photoCell, { borderRadius: colors.radius, borderColor: colors.border }]}>
                <Image source={{ uri }} style={styles.photoCellImage} />
                <TouchableOpacity
                  onPress={() => handleRemovePhoto(idx)}
                  style={styles.photoRemoveBtn}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather name="x" size={12} color="#fff" />
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
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Feather name="camera" size={22} color={colors.mutedForeground} />
                <Text style={[styles.photoAddLabel, { color: colors.mutedForeground }]}>Add photos</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Link a pin */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>LINK A PIN (OPTIONAL)</Text>
          {selectedPin ? (
            <View style={[styles.selectedPin, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedPinName, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedPin.title}
                </Text>
                <Text style={[styles.selectedPinSub, { color: colors.mutedForeground }]}>
                  {selectedPin.collection}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setLinkedPinId(undefined); setPinSearch(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.pinSearchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  value={pinSearch}
                  onChangeText={v => { setPinSearch(v); setShowPins(v.length > 1); }}
                  placeholder="Search catalogue pins…"
                  placeholderTextColor={colors.mutedForeground + '88'}
                  style={[styles.pinSearchInput, { color: colors.foreground }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {pinSearch.length > 0 && (
                  <TouchableOpacity onPress={() => { setPinSearch(''); setShowPins(false); }}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
              {showPins && filteredPins.length > 0 && (
                <View style={[styles.pinDropdown, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {filteredPins.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setLinkedPinId(p.id); setShowPins(false); setPinSearch(''); }}
                      style={[styles.pinDropdownItem, { borderBottomColor: colors.border }]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.pinDropdownName, { color: colors.foreground }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={[styles.pinDropdownSub, { color: colors.mutedForeground }]}>
                        {p.collection} · {p.brand}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {showPins && filteredPins.length === 0 && pinSearch.length > 1 && (
                <Text style={[styles.noPins, { color: colors.mutedForeground }]}>No pins found.</Text>
              )}
            </>
          )}

          {/* Upload progress */}
          {uploadProgress ? (
            <Text style={[styles.uploadProgress, { color: colors.mutedForeground }]}>
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
                backgroundColor: body.trim() ? colors.primary : colors.secondary,
                borderRadius: colors.radius,
              },
            ]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Feather name="send" size={16} color={body.trim() ? '#fff' : colors.mutedForeground} />
                  <Text style={[styles.submitLabel, { color: body.trim() ? '#fff' : colors.mutedForeground }]}>
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
  scroll: { padding: 16, gap: 10 },
  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 4, marginBottom: 4 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    width: '48%',
    padding: 12, borderWidth: 1.5, gap: 3,
    flexGrow: 1,
  },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  typeHint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },

  bodyInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  charCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -6 },

  detailInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },

  // Photo grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    textAlign: 'center', marginTop: 4,
  },

  selectedPin: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderWidth: 1, gap: 10,
  },
  selectedPinName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selectedPinSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  pinSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  pinSearchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },

  pinDropdown: { borderWidth: 1, overflow: 'hidden' },
  pinDropdownItem: {
    padding: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinDropdownName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pinDropdownSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  noPins: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -4 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 8,
  },
  submitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
