/**
 * "Where it lives" editor (#547): put one pin, or a whole selection, in a
 * place. For a trade book, a single pin gets the exact page and pocket you
 * tap; several pins fill the free pockets from the page you choose. New
 * places can be added on the spot.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { describeLocation, type CollectionPlace, type PlaceInput } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { Button } from '@/components/ui';
import { PlaceForm } from '@/components/locations/PlaceForm';
import { radius, spacing } from '@/constants/theme';
import { pagesOf, planHomes, PLACE_KIND_LABEL } from '@/utils/pinHomes';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

interface LocationEditorProps {
  pinIds: string[];
  /** After a save or clear, with a short message for a toast. */
  onDone: (message: string) => void;
}

export function LocationEditor({ pinIds, onDone }: LocationEditorProps) {
  const colors = useColors();
  const loc = usePinLocations();
  const single = pinIds.length === 1;
  const current = single ? loc.locationFor(pinIds[0]) : undefined;
  const [placeId, setPlaceId] = useState<string | null>(current?.placeId ?? loc.places[0]?.id ?? null);
  const [page, setPage] = useState<number>(current?.page ?? 1);
  const [pocket, setPocket] = useState<number | null>(current?.pocket ?? null);
  const [adding, setAdding] = useState(loc.places.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = placeId ? loc.placeById.get(placeId) : undefined;
  const isBook = !!place?.pages && !!place?.pocketsPerPage;
  const allLocations = useMemo(() => Object.values(loc.locations), [loc.locations]);
  const plan = place ? planHomes(place, allLocations, pinIds, single ? { page, pocket: pocket ?? undefined } : { startPage: page }) : null;
  const anyPlaced = pinIds.some(id => loc.locationFor(id));

  const choosePlace = (p: CollectionPlace) => { setPlaceId(p.id); setPage(1); setPocket(null); setError(null); };

  const addPlace = async (input: PlaceInput) => {
    const created = await loc.createPlace(input);
    choosePlace(created);
    setAdding(false);
  };

  const save = async () => {
    if (!place || !plan) return;
    setSaving(true);
    setError(null);
    try {
      await loc.setPinLocations(pinIds, plan.inputs, place);
      const first = plan.inputs[0];
      onDone(single
        ? `Saved: ${describeLocation({ page: first.page ?? null, pocket: first.pocket ?? null, note: null }, place)}`
        : `${pinsWord(pinIds.length)} now live in ${place.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await loc.clearPinLocations(pinIds);
      onDone(single ? 'Location cleared' : `Cleared where ${pinsWord(pinIds.length)} live`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear.');
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return <PlaceForm onSave={addPlace} onCancel={() => setAdding(false)} />;
  }

  const pageMap = place && isBook ? pagesOf(place, allLocations).get(page) : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.homeMuted }]}>{single ? 'Where it lives' : `Where these ${pinsWord(pinIds.length)} live`}</Text>
      <View accessibilityRole="radiogroup" style={styles.places}>
        {loc.places.map(p => {
          const on = p.id === placeId;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => choosePlace(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${p.name}, ${PLACE_KIND_LABEL[p.kind]}`}
              style={[styles.place, { borderColor: on ? colors.homeCoral : colors.homeLine, backgroundColor: on ? colors.homeAqua : colors.homeSurface }]}
            >
              <Feather name={p.kind === 'book' ? 'book' : p.kind === 'display' ? 'image' : p.kind === 'lanyard' ? 'link' : 'box'} size={18} color={on ? colors.homeCoralDeep : colors.homeMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.placeName, { color: colors.homeInk }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.placeMeta, { color: colors.homeMuted }]} numberOfLines={1}>
                  {p.pages && p.pocketsPerPage ? `${p.pages} pages · ${p.pocketsPerPage} pockets each` : PLACE_KIND_LABEL[p.kind]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={() => setAdding(true)} accessibilityRole="button" style={[styles.place, styles.addPlace, { borderColor: colors.homeCoral }]}>
          <Feather name="plus" size={18} color={colors.homeCoralDeep} />
          <Text style={[styles.placeName, { color: colors.homeCoralDeep }]}>New place</Text>
        </TouchableOpacity>
      </View>

      {place && isBook && (
        <>
          <View style={styles.pageRow}>
            <Text style={[styles.label, { color: colors.homeMuted, marginTop: 0 }]}>{single ? 'Page' : 'From page'}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous page" disabled={page <= 1} onPress={() => { setPage(page - 1); setPocket(null); }} style={[styles.stepBtn, { borderColor: colors.homeLine, opacity: page <= 1 ? 0.4 : 1 }]}>
                <Feather name="minus" size={16} color={colors.homeInk} />
              </TouchableOpacity>
              <Text accessibilityLiveRegion="polite" style={[styles.stepValue, { color: colors.homeInk }]}>{page} of {place.pages}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next page" disabled={page >= (place.pages ?? 1)} onPress={() => { setPage(page + 1); setPocket(null); }} style={[styles.stepBtn, { borderColor: colors.homeLine, opacity: page >= (place.pages ?? 1) ? 0.4 : 1 }]}>
                <Feather name="plus" size={16} color={colors.homeInk} />
              </TouchableOpacity>
            </View>
          </View>
          {single ? (
            <View style={styles.pockets}>
              {Array.from({ length: place.pocketsPerPage ?? 0 }, (_, i) => i + 1).map(n => {
                const holder = pageMap?.get(n);
                const mine = holder === pinIds[0];
                const taken = !!holder && !mine;
                const on = pocket === n;
                return (
                  <TouchableOpacity
                    key={n}
                    disabled={taken}
                    onPress={() => setPocket(on ? null : n)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: taken }}
                    accessibilityLabel={`Pocket ${n}${taken ? ', taken' : ''}`}
                    style={[styles.pocket, {
                      borderColor: on ? colors.homeCoral : colors.homeLine,
                      backgroundColor: taken ? colors.homeTealSoft : on ? colors.homeAqua : colors.homeSurface,
                    }]}
                  >
                    <Text style={[styles.pocketText, { color: taken ? colors.homeHeroText : on ? colors.homeCoralDeep : colors.homeMuted }]}>{taken ? '•' : n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.homeMuted }]}>
              {plan && plan.overflow > 0
                ? `Only ${pinIds.length - plan.overflow} free pockets left. The other ${plan.overflow} get the book without a pocket.`
                : 'They fill the free pockets from this page, in order.'}
            </Text>
          )}
        </>
      )}

      {error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      <Button label={single ? 'Save' : `Put ${pinsWord(pinIds.length)} here`} onPress={save} disabled={!place} loading={saving} />
      {anyPlaced && <Button label={single ? 'Clear where it lives' : 'Clear where they live'} variant="text" onPress={clear} />}
      <Text style={[styles.hint, { color: colors.homeMuted }]}>Only you can see where your pins live.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  places: { gap: spacing.sm },
  place: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  addPlace: { borderStyle: 'dashed' },
  placeName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  placeMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 15, fontFamily: 'Inter_600SemiBold', minWidth: 64, textAlign: 'center' },
  pockets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pocket: { width: 52, height: 52, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pocketText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
