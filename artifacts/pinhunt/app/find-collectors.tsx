/**
 * Find Collectors screen — search for other collectors by username,
 * display name, or trading region.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import type { PublicProfile } from '@workspace/pin-repository';

function initials(profile: PublicProfile): string {
  const name = profile.username;
  return name
    .split(' ')
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

// ─── Collector card ───────────────────────────────────────────────────────────

function CollectorCard({ item, onPress }: { item: PublicProfile; onPress(): void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarText}>{initials(item)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.username, { color: colors.foreground }]}>@{item.username}</Text>
        {item.tradingRegion ? (
          <View style={styles.regionRow}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text style={[styles.region, { color: colors.mutedForeground }]}>{item.tradingRegion}</Text>
          </View>
        ) : null}
      </View>
      {item.internationalTradingEnabled && (
        <View style={[styles.badge, { backgroundColor: colors.primary + '22' }]}>
          <Feather name="globe" size={11} color={colors.primary} />
          <Text style={[styles.badgeText, { color: colors.primary }]}>Intl</Text>
        </View>
      )}
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FindCollectorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { searchCollectors } = useProfile();

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string, r: string) => {
    if (!q.trim() && !r.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await searchCollectors({ query: q.trim() || undefined, tradingRegion: r.trim() || undefined });
      setResults(res);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchCollectors]);

  const scheduleSearch = useCallback((q: string, r: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q, r), 400);
  }, [runSearch]);

  const handleQueryChange = (v: string) => { setQuery(v); scheduleSearch(v, region); };
  const handleRegionChange = (v: string) => { setRegion(v); scheduleSearch(query, v); };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Search inputs */}
      <View style={[styles.searchArea, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search by username or name…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleQueryChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.regionBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="map-pin" size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={region}
            onChangeText={handleRegionChange}
            placeholder="Filter by region (optional)"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
          />
          {region.length > 0 && (
            <TouchableOpacity onPress={() => handleRegionChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <CollectorCard
              item={item}
              onPress={() => router.push(`/collector/${item.username}`)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            searched ? (
              <View style={styles.centred}>
                <Feather name="users" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No collectors found</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Try a different search term or region.</Text>
              </View>
            ) : (
              <View style={styles.centred}>
                <Feather name="search" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Find Collectors</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Search by username, name, or trading region.</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  regionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  username: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  displayName: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  region: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  centred: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
