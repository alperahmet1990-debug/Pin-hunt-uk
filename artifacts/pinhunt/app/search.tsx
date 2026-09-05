/**
 * Full-screen pin search.
 *
 * Opened from the Find tab. Shows recent searches and popular pins while
 * idle; typing runs a debounced database search (title / brand / series /
 * character) and lists clickable pins that navigate to the pin detail page.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useCollection } from '@/context/CollectionContext';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin } from '@workspace/pin-repository';

const RECENTS_KEY = 'recent_pin_searches';
const MAX_RECENTS = 8;

/**
 * Ranks a pin's relevance to a search query so collector-intent matches
 * (character metadata) outrank incidental text matches (e.g. "Mickey" only
 * appearing inside "Mickey's of Glendale" as a brand/collection name).
 * Lower is more relevant. Generic — works for any character name, not just
 * specific examples.
 */
function matchRank(pin: CataloguePin, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 6;

  // Tier 1 — character metadata match (junction-table characters, plus the
  // enriched main/all-characters text columns for pins not yet linked in
  // the junction table).
  const charNames = pin.characters.map(c => c.toLowerCase());
  const charText = `${pin.mainCharacter ?? ''};${pin.allCharacters ?? ''}`.toLowerCase();
  if (charNames.some(c => c === q)) return 0;
  if (charNames.some(c => c.startsWith(q)) || pin.mainCharacter?.toLowerCase().startsWith(q)) return 1;
  if (charNames.some(c => c.includes(q)) || charText.includes(q)) return 2;

  // Tier 2 — pin title match
  const title = pin.title.toLowerCase();
  if (title.startsWith(q)) return 3;
  if (title.includes(q)) return 4;

  // Tier 3 — set/series match
  if (pin.collection.toLowerCase().includes(q)) return 5;

  // Tier 4 — everything else (brand, aliases, subject, etc.)
  return 6;
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pins, repository } = usePinCatalogue();
  const { getEntry } = useCollection();

  const [query, setQuery] = useState('');
  const [quickAddPin, setQuickAddPin] = useState<CataloguePin | null>(null);
  const [results, setResults] = useState<CataloguePin[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const seq = useRef(0);

  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  // ── Recents ────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then(raw => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecents(parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTS));
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  const saveRecent = useCallback((term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    setRecents(prev => {
      const next = [t, ...prev.filter(r => r.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENTS);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const removeRecent = useCallback((term: string) => {
    setRecents(prev => {
      const next = prev.filter(r => r !== term);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(RECENTS_KEY).catch(() => { /* ignore */ });
  }, []);

  // ── Debounced database search ───────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    const mySeq = ++seq.current;
    setResults([]);

    if (!q) { setSearching(false); return; }

    // Mock-mode fallback: filter cached list locally.
    if (!repository) {
      const lower = q.toLowerCase();
      setResults(
        pinsRef.current
          .filter(
            p =>
              p.title.toLowerCase().includes(lower) ||
              p.characters.some(c => c.toLowerCase().includes(lower)) ||
              p.collection.toLowerCase().includes(lower) ||
              p.brand.toLowerCase().includes(lower),
          )
          .sort((a, b) => matchRank(a, q) - matchRank(b, q))
          .slice(0, 30),
      );
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [textMatches, characterMatches] = await Promise.all([
          repository.searchPins(q, { limit: 30 }),
          repository.searchPins('', { character: q, limit: 30 }),
        ]);
        if (mySeq !== seq.current) return;
        const seen = new Set<string>();
        const merged: CataloguePin[] = [];
        for (const pin of [...textMatches, ...characterMatches]) {
          if (!seen.has(pin.id)) { seen.add(pin.id); merged.push(pin); }
        }
        // Rank so character matches (collector intent) outrank incidental
        // text matches, then slice — otherwise a relevant character pin
        // could be pushed past the 30-result cap by noisy matches.
        merged.sort((a, b) => matchRank(a, q) - matchRank(b, q));
        setResults(merged.slice(0, 30));
      } catch {
        if (mySeq === seq.current) setResults([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, repository]);

  const openPin = useCallback((pin: CataloguePin) => {
    saveRecent(query);
    Keyboard.dismiss();
    router.push({ pathname: '/pin/[id]', params: { id: pin.id } });
  }, [query, router, saveRecent]);

  // ── Popular pins (from cached catalogue; prefers ones with images) ─────────
  const popular = useMemo(() => {
    const withImages = pins.filter(p => p.imageUrl);
    const source = withImages.length >= 6 ? withImages : pins;
    return source.slice(0, 6);
  }, [pins]);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 20) : insets.top;
  const showIdle = !query.trim();

  return (
    <View style={[styles.screen, { backgroundColor: colors.homeBackground, paddingTop: topPad }]}>
      {/* ── Header: back + search input ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scan'))}
          hitSlop={8}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={24} color={colors.homeInk} />
        </TouchableOpacity>
        <View style={[styles.inputWrap, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine, borderRadius: radius.pill }]}>
          <Feather name="search" size={16} color={colors.homeMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search pins, characters, & more…"
            placeholderTextColor={colors.homeMuted}
            style={[styles.input, { color: colors.homeInk }]}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => saveRecent(query)}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.homeMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      >
        {showIdle ? (
          <>
            {/* ── Beta catalogue note ── */}
            <View style={styles.betaNote}>
              <Feather name="info" size={12} color={colors.homeMuted} />
              <Text style={[styles.betaNoteText, { color: colors.homeMuted }]}>
                PinHunt's catalogue is currently a curated beta collection. More pins will be
                added as catalogue integrations and community validation become available.
              </Text>
            </View>

            {/* ── Recent searches ── */}
            {recents.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>Recent Searches</Text>
                  <TouchableOpacity onPress={clearRecents} hitSlop={8}>
                    <Text style={[styles.clearAll, { color: colors.homeMuted }]}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                {recents.map(term => (
                  <View key={term} style={styles.recentRow}>
                    <TouchableOpacity style={styles.recentTap} onPress={() => setQuery(term)} activeOpacity={0.7}>
                      <Feather name="clock" size={15} color={colors.homeMuted} />
                      <Text style={[styles.recentText, { color: colors.homeInk }]} numberOfLines={1}>{term}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeRecent(term)} hitSlop={8} style={[styles.recentRemove, { backgroundColor: colors.homeAqua }]}>
                      <Feather name="x" size={12} color={colors.homeMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* ── Popular pins ── */}
            {popular.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>Popular Pins</Text>
                <View style={styles.popularGrid}>
                  {popular.map(pin => (
                    <TouchableOpacity
                      key={pin.id}
                      style={[styles.popularCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
                      onPress={() => openPin(pin)}
                      activeOpacity={0.8}
                    >
                      <Image source={getPinImageSource(pin)} style={styles.popularImage} resizeMode="contain" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.section}>
            {searching && results.length === 0 ? (
              <View style={styles.stateRow}>
                <ActivityIndicator size="small" color={colors.homeMuted} />
                <Text style={[styles.stateText, { color: colors.homeMuted }]}>Searching…</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.stateRow}>
                <Feather name="search" size={15} color={colors.homeMuted} />
                <Text style={[styles.stateText, { color: colors.homeMuted }]}>No pins found</Text>
              </View>
            ) : (
              results.map(pin => (
                <TouchableOpacity
                  key={pin.id}
                  onPress={() => openPin(pin)}
                  activeOpacity={0.8}
                  style={[styles.resultRow, { borderBottomColor: colors.homeLine }]}
                >
                  <Image source={getPinImageSource(pin)} style={[styles.resultImage, { backgroundColor: colors.homeAqua }]} />
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultTitle, { color: colors.homeInk }]} numberOfLines={1}>{pin.title}</Text>
                    <Text style={[styles.resultMeta, { color: colors.homeMuted }]} numberOfLines={1}>
                      {pin.brand} · {pin.collection}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={e => { e.stopPropagation?.(); saveRecent(query); setQuickAddPin(pin); }}
                    hitSlop={8}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick add ${pin.title}`}
                    style={[
                      styles.quickAddBtn,
                      { backgroundColor: getEntry(pin.id)?.status && getEntry(pin.id)!.status !== 'none' ? colors.owned : colors.homeCoral },
                    ]}
                  >
                    <Feather
                      name={getEntry(pin.id)?.status && getEntry(pin.id)!.status !== 'none' ? 'check' : 'plus'}
                      size={15}
                      color={colors.homeSurface}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} seaGlass />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  backBtn: { padding: spacing.xs },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0, fontFamily: 'Inter_400Regular' },
  body: { flex: 1 },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  betaNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm - 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  betaNoteText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: spacing.xs },
  clearAll: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2 },
  recentTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  recentText: { fontSize: 15, flex: 1, fontFamily: 'Inter_400Regular' },
  recentRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, marginTop: spacing.sm },
  popularCard: {
    width: '30.5%',
    aspectRatio: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm + 2,
  },
  popularImage: { width: '100%', height: '100%' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  stateText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  resultImage: { width: 44, height: 44, borderRadius: radius.sm - 2 },
  resultInfo: { flex: 1 },
  quickAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  resultMeta: { fontSize: 13, marginTop: 2, fontFamily: 'Inter_400Regular' },
});
