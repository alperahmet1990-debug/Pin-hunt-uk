/**
 * SetCompleteSheet (UX-023, #136): the one-time celebration when a collector
 * finishes a set. The set's pins as a mosaic, "Set complete: 16/16", and
 * View set. A gentle scale-in, skipped with Reduce Motion; the success
 * haptic is native only. Share waits for share links (UX-034).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { CataloguePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { Sheet } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { PinImage } from '@/components/ui/PinImage';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';

const MOSAIC_MAX = 9;

export function SetCompleteSheet({ set, onClose, onViewSet }: {
  set: { name: string; pins: CataloguePin[] } | null;
  onClose: () => void;
  onViewSet: (name: string) => void;
}) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotion(v); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!set) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (reduceMotion) { scale.setValue(1); return; }
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [set, reduceMotion, scale]);

  const total = set?.pins.length ?? 0;
  const shown = set?.pins.slice(0, MOSAIC_MAX) ?? [];
  return (
    <Sheet visible={!!set} onClose={onClose} title="Set complete!">
      {set && (
        <View style={styles.body} testID="set-complete-sheet">
          <Animated.View
            testID="set-complete-mosaic"
            style={[styles.mosaic, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine, transform: [{ scale }] }]}
          >
            {shown.map(pin => (
              <View key={pin.id} style={[styles.cell, { backgroundColor: colors.homeSurface }]}>
                <PinImage source={getPinImageSource(pin)} accessible={false} style={styles.cellImage} contentFit="contain" />
              </View>
            ))}
            <View style={[styles.badge, { backgroundColor: colors.owned, borderColor: colors.homeSurface }]}>
              <Feather name="check" size={18} color={colors.homeSurface} />
            </View>
          </Animated.View>
          <Text style={[styles.count, { color: colors.homeSand }]} accessibilityLiveRegion="polite">
            Set complete: {total}/{total}
          </Text>
          <Text style={[styles.name, { color: colors.homeInk }]} numberOfLines={2}>{set.name}</Text>
          <Text style={[styles.sub, { color: colors.homeMuted }]}>You've collected every pin in this set.</Text>
          <Button label="View set" icon="grid" onPress={() => onViewSet(set.name)} style={styles.primary} />
          <Button label="Close" variant="text" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}

const CELL = 64;
const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.sm },
  mosaic: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6,
    width: CELL * 3 + 6 * 2 + 16 + 2, padding: 8, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.sm,
  },
  cell: { width: CELL, height: CELL, borderRadius: radius.sm, padding: 4, overflow: 'hidden' },
  cellImage: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: -10, right: -10, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, textTransform: 'uppercase' },
  name: { fontSize: 22, lineHeight: 27, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  sub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: spacing.sm },
  primary: { alignSelf: 'stretch' },
});
