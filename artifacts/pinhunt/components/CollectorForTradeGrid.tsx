/**
 * "For Trade (N)" on a collector's profile (UX-027, #139): their whole tin,
 * as a 3-column grid of the shared PinTile (UX-043). Pins on your ISO come
 * first and carry the ISO marker. Tap opens the pin; long-press adds it to
 * your ISO. Only pins the collector listed For Trade are ever shown.
 */
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CollectorForTradePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { PinTile } from '@/components/ui/PinTile';
import { PIN_GRID_GUTTER, pinGridColumns, pinTileSize } from '@/components/ui/PinGrid';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { spacing } from '@/constants/theme';

export function CollectorForTradeGrid({ pins, loading, matchIds, onOpen, onAddToIso }: {
  pins: CollectorForTradePin[];
  loading: boolean;
  /** Pins on the viewer's ISO, shown first with the ISO marker. */
  matchIds: Set<string>;
  onOpen: (pinId: string) => void;
  onAddToIso: (pin: CollectorForTradePin) => void;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const columns = pinGridColumns(width);
  const size = pinTileSize(width, columns);
  if (!loading && pins.length === 0) return null;
  return (
    <View style={styles.section} testID="collector-for-trade">
      <Text accessibilityRole="header" style={[styles.label, { color: colors.homeMuted }]}>
        FOR TRADE{loading ? '' : ` (${pins.length})`}
      </Text>
      {loading ? (
        <SkeletonGrid sidePadding={0} tileSize={size} columns={columns} rows={1} label="Loading pins for trade" />
      ) : (
        <View style={[styles.grid, { gap: PIN_GRID_GUTTER }]}>
          {pins.map(pin => (
            <PinTile
              key={pin.pinId}
              title={pin.title}
              imageUrl={pin.imageUrl}
              size={size}
              framed
              status={matchIds.has(pin.pinId) ? 'wanted' : undefined}
              onPress={() => onOpen(pin.pinId)}
              onLongPress={() => onAddToIso(pin)}
              accessibilityActions={[{ name: 'addToIso', label: 'Add to my ISO' }]}
              onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'addToIso') onAddToIso(pin); }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  label: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
});
