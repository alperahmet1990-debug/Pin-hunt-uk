/**
 * A board's display style and hand-arranged pin positions (realistic
 * boards). Kept on this device, per account, until the board sync carries
 * them too.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_BOARD_DISPLAY,
  isBoardStyle,
  type BoardDisplayPrefs,
  type BoardStyle,
  type PinPlacement,
} from '@/utils/boardDisplay';

const KEY_PREFIX = '@pinhunt_board_display_v1';

type Store = Record<string, BoardDisplayPrefs>;

function parse(raw: string | null): Store {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, Partial<BoardDisplayPrefs>>;
    const out: Store = {};
    for (const [id, p] of Object.entries(data ?? {})) {
      out[id] = {
        style: isBoardStyle(p?.style) ? p.style : DEFAULT_BOARD_DISPLAY.style,
        placements: p?.placements && typeof p.placements === 'object' ? p.placements : {},
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function useBoardDisplay(boardId: string) {
  const { user } = useAuth();
  const key = `${KEY_PREFIX}:${user?.id ?? 'guest'}`;
  const [prefs, setPrefs] = useState<BoardDisplayPrefs>(DEFAULT_BOARD_DISPLAY);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then(raw => { if (live) setPrefs(parse(raw)[boardId] ?? DEFAULT_BOARD_DISPLAY); })
      .catch(() => {});
    return () => { live = false; };
  }, [key, boardId]);

  const save = useCallback((next: BoardDisplayPrefs) => {
    setPrefs(next);
    AsyncStorage.getItem(key)
      .then(raw => AsyncStorage.setItem(key, JSON.stringify({ ...parse(raw), [boardId]: next })))
      .catch(() => {});
  }, [key, boardId]);

  const setStyle = useCallback((style: BoardStyle) => save({ ...prefs, style }), [prefs, save]);
  const setPlacement = useCallback((pinId: string, p: PinPlacement) =>
    save({ ...prefs, placements: { ...prefs.placements, [pinId]: p } }), [prefs, save]);
  const tidy = useCallback(() => save({ ...prefs, placements: {} }), [prefs, save]);
  const setPlacements = useCallback((placements: Record<string, PinPlacement>) =>
    save({ ...prefs, placements }), [prefs, save]);

  return { prefs, setStyle, setPlacement, setPlacements, tidy };
}
