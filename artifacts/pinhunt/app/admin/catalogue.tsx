/**
 * Admin Catalogue — search existing catalogue pins, edit or add new entries.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
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
import palette from '@/constants/colors';
import { radius } from '@/constants/theme';
import { createSupabasePinRepository } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CataloguePin } from '@workspace/pin-repository';

// Theme-independent status colours for module-level lookup tables.
const statusPalette = palette.light;

const VERIFICATION_LABEL: Record<string, string> = {
  verified:                  'Verified',
  needs_source_verification: 'Needs Verification',
  community_submitted:       'Community',
  unverified:                'Unverified',
};
const VERIFICATION_COLOR: Record<string, string> = {
  verified:                  statusPalette.owned,
  needs_source_verification: statusPalette.homeSandInk,
  community_submitted:       statusPalette.forTrade,
  unverified:                statusPalette.homeMuted,
};

export default function AdminCatalogueScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [query, setQuery]     = useState('');
  const [pins, setPins]       = useState<CataloguePin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!repo) { setError('Supabase not configured.'); return; }
    try {
      setLoading(true);
      setError(null);
      const results = await repo.searchPins(q, { limit: 60 });
      setPins(results);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      search(query);
    }, 350);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [query, search]);

  // Initial load
  useEffect(() => { search(''); }, [search]);

  const renderItem = ({ item }: { item: CataloguePin }) => {
    const vColor = VERIFICATION_COLOR[item.verificationStatus ?? 'unverified'] ?? colors.homeMuted;
    const vLabel = VERIFICATION_LABEL[item.verificationStatus ?? 'unverified'] ?? 'Unknown';
    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/admin/pin/[id]' as any, params: { id: item.id } })}
        activeOpacity={0.85}
        style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
      >
        <View style={[styles.thumb, { backgroundColor: colors.homeAqua, borderRadius: 8 }]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <Feather name="image" size={22} color={colors.homeMuted} />
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.cardTitle, { color: colors.homeInk }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.cardBrand, { color: colors.homeMuted }]}>{item.brand}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <View style={[styles.badge, { backgroundColor: vColor + '18' }]}>
              <Text style={[styles.badgeLabel, { color: vColor }]}>{vLabel}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.homeAqua }]}>
              <Text style={[styles.badgeLabel, { color: colors.homeMuted }]}>{item.id}</Text>
            </View>
          </View>
        </View>
        <Feather name="edit-2" size={15} color={colors.homeMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Catalogue' }} />

      {/* Search + Add button */}
      <View style={[styles.searchRow, { backgroundColor: colors.homeBackground, borderBottomColor: colors.homeLine }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: 10, flex: 1 }]}>
          <Feather name="search" size={16} color={colors.homeMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search pins…"
            placeholderTextColor={colors.homeMuted + '88'}
            style={[styles.searchInput, { color: colors.homeInk }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Feather name="x" size={14} color={colors.homeMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/admin/pin/[id]' as any, params: { id: 'new' } })}
          activeOpacity={0.85}
          style={[styles.addBtn, { backgroundColor: colors.homeCoral, borderRadius: 10 }]}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading && !searched ? (
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <ActivityIndicator color={colors.homeCoral} />
        </View>
      ) : error ? (
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={pins}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          style={{ backgroundColor: colors.homeBackground }}
          contentContainerStyle={{ padding: 16, paddingBottom: botPad }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            searched ? (
              <Text style={[styles.count, { color: colors.homeMuted }]}>
                {loading ? 'Searching…' : `${pins.length} pin${pins.length !== 1 ? 's' : ''}`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Feather name="database" size={36} color={colors.homeMuted} />
                <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No pins found</Text>
                <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
                  {query ? 'Try a different search.' : 'The catalogue is empty. Add the first pin!'}
                </Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1 },
  searchInput:{ flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  addBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  count:      { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub:   { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  card:       { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, gap: 12 },
  thumb:      { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImg:   { width: 60, height: 60 },
  cardTitle:  { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  cardBrand:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  badge:      { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
