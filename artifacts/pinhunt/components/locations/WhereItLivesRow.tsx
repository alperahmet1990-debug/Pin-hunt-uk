/**
 * "Where it lives" on pin detail (#547): the place, page and pocket of a pin
 * you have, with a sheet to set or change it. Hidden for pins you don't have
 * (ISO, not in the collection) and when locations aren't available.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { describeLocation } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { LocationEditor } from '@/components/locations/LocationEditor';
import { radius, spacing } from '@/constants/theme';

export function WhereItLivesRow({ pinId }: { pinId: string }) {
  const colors = useColors();
  const toast = useToast();
  const loc = usePinLocations();
  const [open, setOpen] = useState(false);
  if (loc.status === 'off') return null;

  const location = loc.locationFor(pinId);
  const text = location ? describeLocation(location, loc.placeById.get(location.placeId)) : 'Add where it lives';

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={loc.status !== 'ready'}
        accessibilityRole="button"
        accessibilityLabel={location ? `Where it lives: ${text}. Change` : 'Add where it lives'}
        style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
      >
        <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
          <Feather name="book-open" size={18} color={colors.homeCoralDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.homeMuted }]}>Where it lives</Text>
          <Text style={[styles.value, { color: location ? colors.homeInk : colors.homeCoralDeep }]} numberOfLines={2}>
            {loc.status === 'ready' ? text : 'Loading…'}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.homeMuted} />
      </TouchableOpacity>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Where it lives">
        {/* Mounted only while open, so each opening starts fresh. */}
        {open && (
          <LocationEditor
            pinIds={[pinId]}
            onDone={message => { setOpen(false); toast.show({ message }); }}
          />
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
});
