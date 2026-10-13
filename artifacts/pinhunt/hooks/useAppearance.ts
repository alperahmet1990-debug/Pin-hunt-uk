/**
 * Appearance preference (#224): System · Light Side · Dark Side.
 *
 * "System" follows the device, exactly as before. "Light Side" / "Dark Side"
 * are only labels for the existing `light` / `dark` palettes; internal
 * values stay `light` / `dark`. The choice is a per-device UI preference in
 * AsyncStorage (no account data). On iOS/Android it is also passed to
 * `Appearance.setColorScheme` so native chrome (tab bar, pickers) follows it.
 */
import { useSyncExternalStore } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feather } from '@expo/vector-icons';

export type AppearancePreference = 'system' | 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = '@pinhunt_appearance_v1';

export const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'smartphone' },
  { value: 'light', label: 'Light Side', icon: 'sun' },
  { value: 'dark', label: 'Dark Side', icon: 'moon' },
];

export function appearanceLabel(pref: AppearancePreference): string {
  return APPEARANCE_OPTIONS.find(o => o.value === pref)?.label ?? 'System';
}

let current: AppearancePreference = 'system';
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function isPreference(v: unknown): v is AppearancePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

function applyNative(pref: AppearancePreference) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

function emit() {
  for (const l of listeners) l();
}

/** Read the saved preference once; anything unexpected falls back to System. */
export function loadAppearance(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then(saved => {
        if (isPreference(saved) && saved !== current) {
          current = saved;
          applyNative(saved);
          emit();
        }
      })
      .catch(() => {});
  }
  return loading;
}

export function getAppearance(): AppearancePreference {
  return current;
}

export function setAppearance(pref: AppearancePreference) {
  if (!isPreference(pref)) return;
  current = pref;
  applyNative(pref);
  emit();
  AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, pref).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadAppearance();
  return () => { listeners.delete(listener); };
}

/** The saved choice: 'system' | 'light' | 'dark'. */
export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}

/** The scheme to render: the device's when on System, otherwise the chosen one. */
export function useResolvedColorScheme(): 'light' | 'dark' | null {
  const system = useColorScheme();
  const pref = useAppearancePreference();
  if (pref !== 'system') return pref;
  return system === 'light' || system === 'dark' ? system : null;
}

/** Test helper: forget the in-memory state. */
export function __resetAppearanceForTests() {
  current = 'system';
  loading = null;
  listeners.clear();
}
