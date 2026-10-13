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
import AppearanceScreen from '../app/settings/appearance';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => 'light' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), Stack: { Screen: () => null } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
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

  it('Profile shows the current side and opens Settings → Appearance', async () => {
    setAppearance('dark');
    await render(<ProfileScreen />);
    expect(screen.getByText('Dark Side')).toBeTruthy();
    await fireEvent.press(screen.getByText('Appearance'));
    expect(mockPush).toHaveBeenCalledWith('/settings/appearance');
  });

  it('Appearance screen: three preview cards, picking Dark Side applies and saves it', async () => {
    await render(<AppearanceScreen />);
    expect(screen.getByRole('header', { name: 'Pick your side' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /^System\./ }).props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByRole('radio', { name: /^Dark Side\./ }));
    expect(screen.getByRole('radio', { name: /^Dark Side\./ }).props.accessibilityState).toEqual({ checked: true });
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');
  });

  it('keeps the copy free of film references', async () => {
    await render(<AppearanceScreen />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/force|jedi|sith|saber|galaxy far|star wars/i);
  });
});
