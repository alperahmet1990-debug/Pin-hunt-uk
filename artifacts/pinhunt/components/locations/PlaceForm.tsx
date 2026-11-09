/**
 * Add or edit a place where pins live (#547): a trade book (with pages and
 * pockets per page), a board, a display frame, a lanyard, a box or tin, or
 * somewhere else.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PLACE_KINDS, type CollectionPlace, type PlaceInput, type PlaceKind } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { PLACE_KIND_LABEL } from '@/utils/pinHomes';

interface PlaceFormProps {
  /** Editing an existing place; empty for a new one. */
  place?: CollectionPlace;
  onSave: (input: PlaceInput) => Promise<void>;
  onCancel: () => void;
}

const numberOrNull = (text: string) => (text.trim() ? Number(text.replace(/\D/g, '')) || null : null);

export function PlaceForm({ place, onSave, onCancel }: PlaceFormProps) {
  const colors = useColors();
  const [name, setName] = useState(place?.name ?? '');
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? 'book');
  const [pages, setPages] = useState(place?.pages ? String(place.pages) : '12');
  const [pockets, setPockets] = useState(place?.pocketsPerPage ? String(place.pocketsPerPage) : '9');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBook = kind === 'book';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        kind,
        pages: isBook ? numberOrNull(pages) : null,
        pocketsPerPage: isBook ? numberOrNull(pockets) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the place.');
    } finally {
      setSaving(false);
    }
  };

  const field = [styles.input, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.homeMuted }]}>Kind of place</Text>
      <View style={styles.kinds} accessibilityRole="radiogroup">
        {PLACE_KINDS.map(k => {
          const on = k === kind;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.kind, { borderColor: on ? colors.homeCoral : colors.homeLine, backgroundColor: on ? colors.homeAqua : colors.homeSurface }]}
            >
              <Text style={[styles.kindText, { color: on ? colors.homeCoralDeep : colors.homeInk }]}>{PLACE_KIND_LABEL[k]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, { color: colors.homeMuted }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={isBook ? 'Trade book 2' : kind === 'display' ? 'Display frame, hallway' : 'Paris lanyard'}
        placeholderTextColor={colors.homeMuted}
        accessibilityLabel="Place name"
        maxLength={60}
        style={field}
      />

      {isBook && (
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={[styles.label, { color: colors.homeMuted }]}>Pages</Text>
            <TextInput value={pages} onChangeText={setPages} keyboardType="number-pad" accessibilityLabel="Pages" style={field} />
          </View>
          <View style={styles.half}>
            <Text style={[styles.label, { color: colors.homeMuted }]}>Pockets per page</Text>
            <TextInput value={pockets} onChangeText={setPockets} keyboardType="number-pad" accessibilityLabel="Pockets per page" style={field} />
          </View>
        </View>
      )}

      {error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      <View style={styles.row}>
        <View style={styles.half}><Button label="Cancel" variant="secondary" onPress={onCancel} /></View>
        <View style={styles.half}><Button label={place ? 'Save place' : 'Add place'} onPress={save} loading={saving} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kind: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  kindText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Inter_500Medium' },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  half: { flex: 1 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
