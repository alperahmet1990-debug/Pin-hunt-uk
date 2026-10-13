/**
 * CompactPinTile — a catalogue pin as a PinTile (UX-043, #126). Kept so
 * existing call sites (set detail, Pin detail's set strip) don't change; new
 * code should use PinTile directly.
 */
import React from 'react';
import type { CataloguePin } from '@workspace/pin-repository';
import type { CollectionStatus } from '@/types/pin';
import { PinTile } from './PinTile';

interface CompactPinTileProps {
  pin: CataloguePin;
  owned: boolean;
  size: number;
  onPress: () => void;
  /** Small "+" affordance for a missing pin. */
  onQuickAdd?: () => void;
  /**
   * Collection status for the corner marker (Owned ✓, For Trade ⇄, ISO bookmark).
   * Without it the tile only marks owned pins, as before.
   */
  status?: CollectionStatus;
  /** Copies owned; shown as ×N in the top-left corner when above 1. */
  copies?: number;
  /**
   * Select mode: true/false shows a selection circle and makes the tile a
   * checkbox (UX-022). Leave undefined outside select mode.
   */
  selected?: boolean;
}

export function CompactPinTile({ pin, owned, size, onPress, onQuickAdd, status, copies, selected }: CompactPinTileProps) {
  return (
    <PinTile
      title={pin.title}
      imageUrl={pin.imageUrl}
      size={size}
      onPress={onPress}
      status={status && status !== 'none' ? status : owned ? 'owned' : undefined}
      copies={copies}
      dimmed={!owned}
      selected={selected}
      onQuickAdd={!owned ? onQuickAdd : undefined}
    />
  );
}
