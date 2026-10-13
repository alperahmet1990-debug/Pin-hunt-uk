import React from 'react';
import { Appearance } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../constants/colors';
import { useColors } from '../hooks/useColors';
import {
  APPEARANCE_OPTIONS,
  APPEARANCE_STORAGE_KEY,
  __resetAppearanceForTests,
  loadAppearance,
  setAppearance,
} from '../hooks/useAppearance';
import ProfileScreen from '../app/(tabs)/profile';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => 'light' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { username: 'demo', isAdmin: false }, loading: false }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('@/context/SubmissionNotificationsContext', () => ({ useSubmissionNotifications: () => ({ unseenCount: 0 }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [] }) }));

const setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});

beforeEach(async () => {
  __resetAppearanceForTests();
  setScheme.mockClear();
  await AsyncStorage.removeItem(APPEARANCE_STORAGE_KEY);
});

describe('Appearance: System · Light Side · Dark Side (#224)', () => {
  it('labels the options Light Side / Dark Side with sun and moon icons', () => {
    expect(APPEARANCE_OPTIONS.map(o => [o.value, o.label, o.icon])).toEqual([
      ['system', 'System', 'smartphone'],
      ['light', 'Light Side', 'sun'],
      ['dark', 'Dark Side', 'moon'],
    ]);
  });

  it('System follows the device; Dark Side uses the existing dark palette', async () => {
    const { result } = await renderHook(() => useColors());
    expect(result.current.homeBackground).toBe(colors.light.homeBackground);
    await act(async () => setAppearance('dark'));
    expect(result.current.homeBackground).toBe(colors.dark.homeBackground);
    expect(setScheme).toHaveBeenLastCalledWith('dark');
    await act(async () => setAppearance('system'));
    expect(result.current.homeBackground).toBe(colors.light.homeBackground);
    expect(setScheme).toHaveBeenLastCalledWith('unspecified');
  }, 20_000);

  it('saves the choice on the device and restores it', async () => {
    setAppearance('dark');
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');
    __resetAppearanceForTests();
    await loadAppearance();
    const { result } = await renderHook(() => useColors());
    expect(result.current.homeBackground).toBe(colors.dark.homeBackground);
  });

  it('ignores an unexpected saved value', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'sepia');
    await loadAppearance();
    const { result } = await renderHook(() => useColors());
    expect(result.current.homeBackground).toBe(colors.light.homeBackground);
  });

  it('Profile → Appearance picks Light Side', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Appearance'));
    expect(screen.getByRole('radio', { name: 'System, follows your device' }).props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Light Side' }));
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');
    expect(screen.getByText('Light Side')).toBeTruthy();
  });
});
