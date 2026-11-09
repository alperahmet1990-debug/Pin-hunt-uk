/**
 * Where your pins live (#547): your places (trade books, frames, lanyards,
 * boxes) with how many pins are in each, a way into "Find them a home" for
 * pins without a place, and adding a place. Only you can see this.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { useOwnedPins } from '@/hooks/useOwnedPins';
import { EmptyState } from '@/components/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { PlaceForm } from '@/components/locations/PlaceForm';
import { radius, spacing } from '@/constants/theme';
import { PLACE_KIND_LABEL } from '@/utils/pinHomes';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

export default function PlacesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const loc = usePinLocations();
  const { ids } = useOwnedPins();
  const [adding, setAdding] = useState(false);

  const counts = new Map<string, number>();
  for (const l of Object.values(loc.locations)) counts.set(l.placeId, (counts.get(l.placeId) ?? 0) + 1);
  const unplaced = ids.filter(id => !loc.locations[id]).length;

  if (loc.status === 'off') {
    return (
      <>
        <Stack.Screen options={{ title: 'Where your pins live' }} />
        <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
          <EmptyState icon="book-open" title="Not available yet" subtitle="Sign in to keep track of which trade book, page or frame each pin is in." />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Where your pins live' }} />
      <ScrollView
        style={{ backgroundColor: colors.homeBackground }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <Text style={[styles.intro, { color: colors.homeMuted }]}>
          Keep track of which trade book, page or frame each pin is in. Only you can see this.
        </Text>

        {unplaced > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/places/home')}
            accessibilityRole="button"
            accessibilityLabel={`Find them a home: ${pinsWord(unplaced)} without a place`}
            style={[styles.homeCard, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}
          >
            <Feather name="home" size={22} color={colors.homeSand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.homeTitle, { color: colors.homeSand }]}>Find them a home</Text>
              <Text style={[styles.homeSub, { color: colors.homeInk }]}>{pinsWord(unplaced)} without a place yet</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.homeSand} />
          </TouchableOpacity>
        )}

        <Text style={[styles.section, { color: colors.homeMuted }]}>Your places</Text>
        {loc.places.length === 0 && loc.status === 'ready' && (
          <Text style={[styles.intro, { color: colors.homeMuted }]}>No places yet. Add your first trade book, frame or lanyard.</Text>
        )}
        {loc.places.map(p => (
          <TouchableOpacity
            key={p.id}
            onPress={() => router.push({ pathname: '/places/[id]', params: { id: p.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${pinsWord(counts.get(p.id) ?? 0)}`}
            style={[styles.place, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            <View style={[styles.placeIcon, { backgroundColor: colors.homeAqua }]}>
              <Feather name={p.kind === 'book' ? 'book' : p.kind === 'display' ? 'image' : p.kind === 'lanyard' ? 'link' : 'box'} size={18} color={colors.homeCoralDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.placeName, { color: colors.homeInk }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.placeMeta, { color: colors.homeMuted }]} numberOfLines={1}>
                {PLACE_KIND_LABEL[p.kind]}{p.pages && p.pocketsPerPage ? ` · ${p.pages} pages` : ''} · {pinsWord(counts.get(p.id) ?? 0)}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.homeMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={[styles.place, styles.addPlace, { borderColor: colors.homeCoral }]}
        >
          <Feather name="plus" size={18} color={colors.homeCoralDeep} />
          <Text style={[styles.placeName, { color: colors.homeCoralDeep }]}>New place</Text>
        </TouchableOpacity>
      </ScrollView>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="New place">
        {adding && (
          <PlaceForm
            onCancel={() => setAdding(false)}
            onSave={async input => {
              const place = await loc.createPlace(input);
              setAdding(false);
              toast.show({ message: `Added ${place.name}` });
            }}
          />
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, maxWidth: 720, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  homeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.sm },
  homeTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  homeSub: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 2 },
  section: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg },
  place: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  addPlace: { borderStyle: 'dashed', borderWidth: 1.5 },
  placeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  placeMeta: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
