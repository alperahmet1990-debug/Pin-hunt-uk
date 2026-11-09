/**
 * One place where pins live (#547). A trade book shows page by page, each
 * pocket with its pin, like flicking through the real binder; frames,
 * lanyards and boxes show their pins as a grid. Edit or delete the place
 * here (deleting it unplaces its pins; they stay in the collection).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CataloguePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { useOwnedPins } from '@/hooks/useOwnedPins';
import { EmptyState } from '@/components/EmptyState';
import { Button, ConfirmDialog, PinTile } from '@/components/ui';
import { PinImage } from '@/components/ui/PinImage';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { PlaceForm } from '@/components/locations/PlaceForm';
import { getPinImageSource } from '@/utils/pinImage';
import { pagesOf, PLACE_KIND_LABEL } from '@/utils/pinHomes';
import { radius, spacing } from '@/constants/theme';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const loc = usePinLocations();
  const { pins } = useOwnedPins();
  const place = loc.placeById.get(id ?? '');
  const [page, setPageState] = useState(1);
  const pageChosen = useRef(false);
  const setPage = (n: number) => { pageChosen.current = true; setPageState(n); };
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pinById = useMemo(() => new Map(pins.map(p => [p.pin.id, p.pin])), [pins]);
  const here = useMemo(() => Object.values(loc.locations).filter(l => l.placeId === id), [loc.locations, id]);
  const isBook = !!place?.pages && !!place?.pocketsPerPage;
  // Open on the first page that has pins, like opening the binder where they are.
  const firstPage = useMemo(() => Math.min(...here.map(l => l.page ?? Infinity)), [here]);
  useEffect(() => {
    if (!pageChosen.current && Number.isFinite(firstPage)) setPageState(firstPage);
  }, [firstPage]);
  const pageMap = place && isBook ? pagesOf(place, here).get(page) : undefined;
  const loose = here.filter(l => !isBook || !l.page || !l.pocket)
    .map(l => pinById.get(l.pinId)).filter((p): p is CataloguePin => !!p);

  if (!place) {
    return (
      <>
        <Stack.Screen options={{ title: 'Place' }} />
        <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
          <EmptyState icon="book-open" title={loc.status === 'ready' ? 'Place not found' : 'Loading…'} />
        </View>
      </>
    );
  }

  const contentWidth = Math.min(width - spacing.lg * 2, 760);
  const cols = Math.max(2, Math.ceil(Math.sqrt(place.pocketsPerPage ?? 9)));
  // Inside the screen padding and the binder's own padding.
  const pocketSize = Math.floor((contentWidth - spacing.lg * 2 - spacing.xl * 2 - spacing.md * (cols - 1)) / cols);
  const openPin = (pinId: string) => router.push({ pathname: '/pin/[id]', params: { id: pinId } });

  return (
    <>
      <Stack.Screen options={{ title: place.name }} />
      <ScrollView
        style={{ backgroundColor: colors.homeBackground }}
        contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <Text style={[styles.meta, { color: colors.homeMuted }]}>
          {PLACE_KIND_LABEL[place.kind]}{isBook ? ` · ${place.pages} pages · ${place.pocketsPerPage} pockets each` : ''} · {pinsWord(here.length)}
        </Text>

        {isBook && (
          <>
            <View style={styles.pageRow}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous page" disabled={page <= 1} onPress={() => setPage(page - 1)} style={[styles.stepBtn, { borderColor: colors.homeLine, opacity: page <= 1 ? 0.4 : 1 }]}>
                <Feather name="chevron-left" size={18} color={colors.homeInk} />
              </TouchableOpacity>
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.pageTitle, { color: colors.homeInk }]}>Page {page}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next page" disabled={page >= (place.pages ?? 1)} onPress={() => setPage(page + 1)} style={[styles.stepBtn, { borderColor: colors.homeLine, opacity: page >= (place.pages ?? 1) ? 0.4 : 1 }]}>
                <Feather name="chevron-right" size={18} color={colors.homeInk} />
              </TouchableOpacity>
            </View>
            <View style={[styles.binder, { backgroundColor: colors.homeTealSoft }]}>
              {Array.from({ length: place.pocketsPerPage ?? 0 }, (_, i) => i + 1).map(n => {
                const pinId = pageMap?.get(n);
                const pin = pinId ? pinById.get(pinId) : undefined;
                return pin ? (
                  <TouchableOpacity
                    key={n}
                    onPress={() => openPin(pin.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Pocket ${n}: ${pin.title}`}
                    style={[styles.pocket, { width: pocketSize, height: pocketSize, backgroundColor: 'rgba(255,255,255,0.14)' }]}
                  >
                    <PinImage source={getPinImageSource(pin)} accessible={false} contentFit="contain" style={styles.pocketImage} />
                  </TouchableOpacity>
                ) : (
                  <View
                    key={n}
                    accessibilityLabel={`Pocket ${n}: empty`}
                    style={[styles.pocket, styles.emptyPocket, { width: pocketSize, height: pocketSize }]}
                  >
                    <Text style={styles.emptyText}>{n}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {loose.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.homeMuted }]}>{isBook ? 'In this book, no pocket yet' : 'Pins here'}</Text>
            <View style={styles.grid}>
              {loose.map(pin => (
                <View key={pin.id} style={{ width: 108 }}>
                  <PinTile title={pin.title} imageUrl={pin.imageUrl} size={108} onPress={() => openPin(pin.id)} />
                </View>
              ))}
            </View>
          </>
        )}
        {here.length === 0 && (
          <Text style={[styles.meta, { color: colors.homeMuted }]}>Nothing here yet. Open a pin and choose "Where it lives", or use Find them a home.</Text>
        )}

        <View style={styles.actions}>
          <View style={{ flex: 1 }}><Button label="Edit place" variant="secondary" icon="edit-2" onPress={() => setEditing(true)} /></View>
          <View style={{ flex: 1 }}><Button label="Delete" variant="destructive" icon="trash-2" onPress={() => setConfirmDelete(true)} /></View>
        </View>
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit place">
        {editing && (
          <PlaceForm
            place={place}
            onCancel={() => setEditing(false)}
            onSave={async input => { await loc.updatePlace(place.id, input); setEditing(false); toast.show({ message: 'Place saved' }); }}
          />
        )}
      </Sheet>
      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${place.name}?`}
        message={here.length > 0 ? `The ${pinsWord(here.length)} in it stay in your collection, just without a place.` : 'It has no pins in it.'}
        confirmLabel="Delete place"
        destructive
        onConfirm={async () => {
          setConfirmDelete(false);
          await loc.deletePlace(place.id);
          toast.show({ message: `Deleted ${place.name}` });
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, alignSelf: 'center' },
  meta: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  binder: { borderRadius: radius.lg, padding: spacing.xl, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pocket: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  pocketImage: { width: '100%', height: '100%' },
  emptyPocket: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.45)' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  section: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
