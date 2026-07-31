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
import type { CataloguePin } from '@workspace/pin-repository';

const RECENTS_KEY = 'recent_pin_searches';
const MAX_RECENTS = 8;

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
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* ── Header: back + search input ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scan'))}
          hitSlop={8}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.inputWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: 999 }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search pins, characters, & more…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => saveRecent(query)}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {showIdle ? (
          <>
            {/* ── Beta catalogue note ── */}
            <View style={styles.betaNote}>
              <Feather name="info" size={12} color={colors.mutedForeground} />
              <Text style={[styles.betaNoteText, { color: colors.mutedForeground }]}>
                PinHunt's catalogue is currently a curated beta collection. More pins will be
                added as catalogue integrations and community validation become available.
              </Text>
            </View>

            {/* ── Recent searches ── */}
            {recents.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Searches</Text>
                  <TouchableOpacity onPress={clearRecents} hitSlop={8}>
                    <Text style={[styles.clearAll, { color: colors.mutedForeground }]}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                {recents.map(term => (
                  <View key={term} style={styles.recentRow}>
                    <TouchableOpacity style={styles.recentTap} onPress={() => setQuery(term)} activeOpacity={0.7}>
                      <Feather name="clock" size={15} color={colors.mutedForeground} />
                      <Text style={[styles.recentText, { color: colors.foreground }]} numberOfLines={1}>{term}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeRecent(term)} hitSlop={8} style={[styles.recentRemove, { backgroundColor: colors.secondary }]}>
                      <Feather name="x" size={12} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* ── Popular pins ── */}
            {popular.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Popular Pins</Text>
                <View style={styles.popularGrid}>
                  {popular.map(pin => (
                    <TouchableOpacity
                      key={pin.id}
                      style={[styles.popularCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
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
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Searching…</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.stateRow}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>No pins found</Text>
              </View>
            ) : (
              results.map(pin => (
                <TouchableOpacity
                  key={pin.id}
                  onPress={() => openPin(pin)}
                  activeOpacity={0.8}
                  style={[styles.resultRow, { borderBottomColor: colors.border }]}
                >
                  <Image source={getPinImageSource(pin)} style={[styles.resultImage, { backgroundColor: colors.secondary }]} />
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{pin.title}</Text>
                    <Text style={[styles.resultMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
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
                      { backgroundColor: getEntry(pin.id)?.status && getEntry(pin.id)!.status !== 'none' ? colors.owned : colors.primary },
                    ]}
                  >
                    <Feather
                      name={getEntry(pin.id)?.status && getEntry(pin.id)!.status !== 'none' ? 'check' : 'plus'}
                      size={15}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  backBtn: { padding: 4 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginRight: 8,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  body: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  betaNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  betaNoteText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  clearAll: { fontSize: 13, fontWeight: '500' },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  recentTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentText: { fontSize: 15, flex: 1 },
  recentRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  popularCard: {
    width: '30.5%',
    aspectRatio: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  popularImage: { width: '100%', height: '100%' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  stateText: { fontSize: 14 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  resultImage: { width: 44, height: 44, borderRadius: 8 },
  resultInfo: { flex: 1 },
  quickAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: { fontSize: 15, fontWeight: '600' },
  resultMeta: { fontSize: 13, marginTop: 2 },
});
