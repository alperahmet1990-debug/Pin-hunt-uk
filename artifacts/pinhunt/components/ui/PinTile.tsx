/**
 * PinTile — the one pin tile for every pin grid (UX-043, #126): square image,
 * one-line title, and optional corner slots:
 *   top-left     ×N copies, or a camera badge when the pin has no catalogue photo
 *   top-right    collection status (Owned ✓, For Trade ⇄, ISO bookmark)
 *   bottom-right selection tick (select mode) or the quick-add "+"
 *   bottom-left  "Missing" tag on a set's pins you don't have (with a dashed outline)
 * Screen readers hear one label: "Title, Owned, 2 copies, photo needed".
 * Images go through expo-image (memory + disk cache).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent, type AccessibilityActionInfo, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import type { CollectionStatus } from '@/types/pin';
import { STATUS_BADGE } from './StatusBadge';

type ActiveStatus = Exclude<CollectionStatus, 'none'>;

const STATUS_ICON: Record<ActiveStatus, keyof typeof Feather.glyphMap> = {
  owned: 'check',
  for_trade: 'repeat',
  wanted: 'bookmark',
};

export interface PinTileProps {
  title: string;
  imageUrl?: string;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** Collection status for the top-right marker. */
  status?: CollectionStatus;
  /** Copies owned; ×N top-left when above 1. */
  copies?: number;
  /** Fade the artwork (e.g. a pin that can't be picked); markers stay full strength. */
  dimmed?: boolean;
  /**
   * A set's pin you don't have yet: dashed outline and a "Missing" tag, so the
   * state never relies on colour or fading alone (UX-048). Artwork stays full colour.
   */
  missing?: boolean;
  /** Camera badge top-left: no catalogue photo yet (photo contributors). */
  photoNeeded?: boolean;
  /** Select mode: true/false makes the tile a checkbox with a tick; undefined outside select mode. */
  selected?: boolean;
  /** In select mode, a tile that can't be selected (e.g. already owned). */
  selectionDisabled?: boolean;
  /** Small "+" bottom-right (outside select mode). */
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  /** VoiceOver custom actions, e.g. the long-press quick actions (UX-016). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

/** "Title, Owned, 2 copies, photo needed" — what VoiceOver reads for the tile. */
export function pinTileLabel(p: Pick<PinTileProps, 'title' | 'status' | 'copies' | 'photoNeeded' | 'missing'>): string {
  const status = p.status && p.status !== 'none' ? STATUS_BADGE[p.status].label : null;
  return [p.title, status, p.missing ? 'missing' : null, p.copies && p.copies > 1 ? `${p.copies} copies` : null, p.photoNeeded ? 'photo needed' : null]
    .filter(Boolean)
    .join(', ');
}

export function PinTile(props: PinTileProps) {
  const {
    title, imageUrl, size, onPress, onLongPress, status, copies, dimmed, missing, photoNeeded,
    selected, selectionDisabled, onQuickAdd, quickAddLabel, accessibilityActions, onAccessibilityAction,
  } = props;
  const colors = useColors();
  const marker: ActiveStatus | null = status && status !== 'none' ? status : null;
  const markerColor = marker === 'for_trade' ? colors.forTrade : marker === 'wanted' ? colors.wanted : colors.owned;
  const selecting = selected !== undefined;
  const source: ImageSourcePropType = imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={selecting && selectionDisabled ? 1 : 0.85}
      style={{ width: size }}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? (selectionDisabled ? { checked: !!selected, disabled: true } : { checked: !!selected }) : undefined}
      accessibilityLabel={pinTileLabel(props)}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View style={{ width: size, height: size }}>
        {/* Only the artwork fades; the markers stay full strength. */}
        <View
          style={[
            styles.imageWrap,
            { width: size, height: size, backgroundColor: colors.homeAqua, opacity: dimmed ? 0.5 : 1 },
            missing && [styles.missingOutline, { borderColor: colors.homeMuted }],
          ]}
        >
          <Image source={source} style={styles.image} contentFit="contain" cachePolicy="memory-disk" transition={120} />
        </View>
        {selected && <View pointerEvents="none" style={[styles.selectedRing, { width: size, height: size, borderColor: colors.homeCoral }]} />}
        {marker && (
          <View style={[styles.statusMarker, { backgroundColor: markerColor }]}>
            <Feather name={STATUS_ICON[marker]} size={9} color={colors.homeSurface} />
          </View>
        )}
        {copies != null && copies > 1 ? (
          <View style={[styles.copies, { backgroundColor: colors.homeInk }]}>
            <Text style={[styles.copiesLabel, { color: colors.homeSurface }]}>×{copies}</Text>
          </View>
        ) : photoNeeded ? (
          <View style={[styles.photoBadge, { backgroundColor: colors.homeSurface + 'F2', borderColor: colors.homeCoral }]}>
            <Feather name="camera" size={10} color={colors.homeCoral} />
          </View>
        ) : null}
        {missing && (
          <View pointerEvents="none" style={[styles.missingTag, { backgroundColor: colors.homeSurface + 'F2', borderColor: colors.homeLine }]}>
            <Text style={[styles.missingLabel, { color: colors.homeMuted }]}>Missing</Text>
          </View>
        )}
        {selecting ? (
          !selectionDisabled && (
            <View
              pointerEvents="none"
              style={[styles.selectCircle, selected
                ? { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }
                : { backgroundColor: colors.homeSurface + 'E6', borderColor: colors.homeLine }]}
            >
              {selected && <Feather name="check" size={12} color={colors.homeSurface} />}
            </View>
          )
        ) : onQuickAdd ? (
          <TouchableOpacity
            onPress={e => { e.stopPropagation?.(); onQuickAdd(); }}
            hitSlop={13}
            accessibilityRole="button"
            accessibilityLabel={quickAddLabel ?? `Quick add ${title}`}
            style={[styles.addBadge, { backgroundColor: colors.homeCoral }]}
          >
            <Feather name="plus" size={11} color={colors.homeSurface} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: dimmed ? colors.homeMuted : colors.homeInk }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  imageWrap: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  selectedRing: { position: 'absolute', top: 0, left: 0, borderWidth: 2.5, borderRadius: radius.md },
  statusMarker: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  copies: { position: 'absolute', top: 5, left: 5, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1 },
  copiesLabel: { fontSize: 9.5, fontFamily: 'Inter_700Bold' },
  photoBadge: { position: 'absolute', top: 5, left: 5, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  selectCircle: { position: 'absolute', bottom: 5, right: 5, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addBadge: { position: 'absolute', bottom: 5, right: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  missingOutline: { borderWidth: 1.5, borderStyle: 'dashed' },
  missingTag: { position: 'absolute', bottom: 5, left: 5, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 5, paddingVertical: 1 },
  missingLabel: { fontSize: 9.5, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 6, textAlign: 'center' },
});
