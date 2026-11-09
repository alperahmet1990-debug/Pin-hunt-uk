/**
 * "Where they live" in the Organise panel (#547, iPad). Selecting: a target
 * that opens the place picker for the whole selection (tap it, or drop the
 * dragged pins on it). Not selecting: a way into Where your pins live, with how
 * many pins still have no place.
 *
 * Render only when getPinLocationService() is set: it reads the signed-in
 * collector's places.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { DeskTarget } from '@/components/CollectionDeskPanel';
import { LocationEditor } from '@/components/locations/LocationEditor';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { spacing } from '@/constants/theme';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

interface Props {
  selecting: boolean;
  /** Selected pin ids. */
  ids: string[];
  /** Ids of every pin you have (owned or For Trade). */
  ownedIds: string[];
  onOpenPlaces: () => void;
  /** After the selection has been given a place. */
  onDone: () => void;
}

export function DeskPlacesSection({ selecting, ids, ownedIds, onOpenPlaces, onDone }: Props) {
  const colors = useColors();
  const toast = useToast();
  const loc = usePinLocations();
  const [open, setOpen] = useState(false);
  if (loc.status === 'off') return null;

  // Only pins you have can live somewhere.
  const placeable = ids.filter(id => ownedIds.includes(id));
  const active = selecting && placeable.length > 0;
  const unplaced = ownedIds.filter(id => !loc.locations[id]).length;

  return (
    <>
      <Text style={[styles.section, { color: colors.homeMuted }]}>Where they live</Text>
      {selecting ? (
        <DeskTarget
          id="places"
          label="Set where they live"
          icon="book-open"
          active={active}
          disabled={!active || loc.status !== 'ready'}
          detail={active ? `Choose a place for ${pinsWord(placeable.length)}` : 'Select pins you have'}
          dropLabel="Choose where they live"
          onPress={() => setOpen(true)}
          onDrop={() => setOpen(true)}
          a11yLabel={active ? `Set where ${pinsWord(placeable.length)} live` : 'Set where they live'}
        />
      ) : (
        <DeskTarget
          id="places"
          label="Where your pins live"
          icon="book-open"
          active={false}
          disabled={false}
          detail={unplaced > 0 ? `${pinsWord(unplaced)} without a place` : 'Every pin has a place'}
          dropLabel="Where your pins live"
          onPress={onOpenPlaces}
          onDrop={onOpenPlaces}
          a11yLabel={`Where your pins live, ${pinsWord(unplaced)} without a place`}
        />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Where they live">
        {open && (
          <LocationEditor
            pinIds={placeable}
            onDone={message => { setOpen(false); toast.show({ message }); onDone(); }}
          />
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg, fontSize: 12, fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
