/**
 * Create Community Post screen.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import type { CommunityPostType } from '@workspace/pin-repository';

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

  const handleSubmit = async () => {
    if (!repo || !userId) return;
    if (!body.trim()) { Alert.alert('Please add some content to your post.'); return; }
    try {
      setSaving(true);
      const post = await repo.createCommunityPost(userId, {
        postType,
        body: body.trim(),
        linkedPinId,
      });
      router.replace({ pathname: '/community/post/[id]' as any, params: { id: post.id } });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create post. Try again.');
    } finally {
      setSaving(false);
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
