/**
 * Edit Community Post screen — author can update the body, post type,
 * remove existing photos, or add new ones. Removed photos are cleaned
 * out of storage by the repository.
 */
import React, { useEffect, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { uploadCommunityPhoto } from '@/utils/communityPhoto';
import { radius, spacing } from '@/constants/theme';
import type { CommunityPostType } from '@workspace/pin-repository';

const MAX_PHOTOS = 6;

const POST_TYPES: Array<{ key: CommunityPostType; label: string; emoji: string; hint: string }> = [
  { key: 'for_trade',    label: 'Trade',        emoji: '🔄', hint: 'Offering pins to swap' },
  { key: 'in_search_of', label: 'ISO',          emoji: '🔍', hint: 'Looking for specific pins' },
  { key: 'discussion',   label: 'Discussion',   emoji: '💬', hint: 'General chat' },
  { key: 'new_pickup',   label: 'Event',        emoji: '📦', hint: 'Share an upcoming event' },
];

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();

  // Same category colours as the Community feed badges (constants/colors.ts home* tokens).
  const TYPE_COLOR: Record<CommunityPostType, string> = {
    in_search_of: colors.homeSandInk,
    for_trade:    colors.homeCoral,
    for_sale:     colors.owned,
    new_pickup:   colors.homeCoralDeep,
    discussion:   colors.homeMuted,
  };

  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [postType,    setPostType]    = useState<CommunityPostType>('discussion');
  const [body,        setBody]        = useState('');
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);  // already-uploaded URLs
  const [newPhotos,   setNewPhotos]   = useState<string[]>([]);        // local file URIs to upload
  const [saving,      setSaving]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;
  const totalPhotos = existingPhotos.length + newPhotos.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!repo || !id) { setLoading(false); return; }
      try {
        const p = await repo.getCommunityPost(id);
        if (cancelled) return;
        if (!p) { setError('Post not found.'); return; }
        if (userId && p.authorId !== userId) { setError('You can only edit your own posts.'); return; }
        setPostType(p.postType);
        setBody(p.body);
        setExistingPhotos(p.photos ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load post.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [repo, id, userId]);

  const handlePickPhotos = async () => {
    const remaining = MAX_PHOTOS - totalPhotos;
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
      setNewPhotos(prev => [...prev, ...uris].slice(0, MAX_PHOTOS - existingPhotos.length));
    }
  };

  const handleSave = async () => {
    if (!repo || !userId || !id) return;
    if (!body.trim()) { Alert.alert('Please add some content to your post.'); return; }
    try {
      setSaving(true);

      // Upload any newly added photos first
      const uploaded: string[] = [];
      let failedCount = 0;
      if (newPhotos.length > 0) {
        for (let i = 0; i < newPhotos.length; i++) {
          setUploadProgress(`Uploading photos (${i + 1}/${newPhotos.length})…`);
          try {
            const url = await uploadCommunityPhoto(userId, newPhotos[i], i);
            uploaded.push(url);
          } catch {
            failedCount++;
          }
        }
        setUploadProgress('');
      }

      await repo.updateCommunityPost(id, {
        postType,
        body: body.trim(),
        photos: [...existingPhotos, ...uploaded],
      });

      router.back();

      if (failedCount > 0) {
        const photoWord = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
        Alert.alert(
          'Some photos couldn\'t upload',
          `${photoWord(failedCount)} couldn't be uploaded — the rest of your changes were saved.`,
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save changes. Try again.');
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Post' }} />
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <ActivityIndicator color={colors.homeCoral} />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Post' }} />
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_500Medium' }}>{error}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Post' }} />
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
                  <Text style={styles.typeEmoji}>{pt.emoji}</Text>
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
          <Text style={[styles.label, { color: colors.homeMuted }]}>POST TEXT</Text>
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

          {/* Photos */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>
            PHOTOS ({totalPhotos}/{MAX_PHOTOS})
          </Text>
          <View style={styles.photoGrid}>
            {existingPhotos.map((uri, idx) => (
              <View key={uri} style={[styles.photoCell, { borderRadius: radius.lg, borderColor: colors.homeLine }]}>
                <Image source={{ uri }} style={styles.photoCellImage} />
                <TouchableOpacity
                  onPress={() => setExistingPhotos(prev => prev.filter((_, i) => i !== idx))}
                  style={styles.photoRemoveBtn}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather name="x" size={12} color={colors.homeSurface} />
                </TouchableOpacity>
              </View>
            ))}
            {newPhotos.map((uri, idx) => (
              <View key={uri + idx} style={[styles.photoCell, { borderRadius: radius.lg, borderColor: colors.homeLine }]}>
                <Image source={{ uri }} style={styles.photoCellImage} />
                <View style={[styles.newBadge, { backgroundColor: colors.homeCoral }]}>
                  <Text style={[styles.newBadgeText, { color: colors.homeSurface }]}>NEW</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setNewPhotos(prev => prev.filter((_, i) => i !== idx))}
                  style={styles.photoRemoveBtn}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather name="x" size={12} color={colors.homeSurface} />
                </TouchableOpacity>
              </View>
            ))}
            {totalPhotos < MAX_PHOTOS && (
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

          {/* Upload progress */}
          {uploadProgress ? (
            <Text style={[styles.uploadProgress, { color: colors.homeMuted }]}>
              {uploadProgress}
            </Text>
          ) : null}

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
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
                  <Feather name="check" size={16} color={body.trim() ? colors.homeSurface : colors.homeMuted} />
                  <Text style={[styles.submitLabel, { color: body.trim() ? colors.homeSurface : colors.homeMuted }]}>
                    Save Changes
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  scroll: { padding: spacing.lg, gap: spacing.sm + 2 },
  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: spacing.xs, marginBottom: spacing.xs },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeBtn: {
    width: '48%',
    padding: spacing.md, borderWidth: 1.5, gap: 3,
    flexGrow: 1,
  },
  typeEmoji: { fontSize: 20 },
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
  newBadge: {
    position: 'absolute',
    bottom: 4, left: 4,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  newBadgeText: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
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

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md + 2, marginTop: spacing.xs,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  submitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
