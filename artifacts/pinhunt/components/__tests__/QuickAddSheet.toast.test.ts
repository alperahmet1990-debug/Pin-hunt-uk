jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardStickyView: require('react-native').View }));
import { canUndoStatusChange, statusChangeMessage } from '../QuickAddSheet';

describe('QuickAddSheet toast copy', () => {
  it.each([
    ['none', 'owned', 'Added to your collection as Owned'],
    ['wanted', 'for_trade', 'Added to your collection as For Trade'],
    ['owned', 'for_trade', 'Marked as For Trade'],
    ['none', 'wanted', 'Added to your ISO'],
    ['owned', 'none', 'Removed from your collection'],
    ['wanted', 'none', 'Removed from your ISO'],
  ] as const)('%s → %s: "%s"', (prev, next, text) => {
    expect(statusChangeMessage(prev, next)).toBe(text);
  });
});

describe('Undo is only offered when it restores exactly', () => {
  it('allows undo from no status or ISO, and between Owned and For Trade', () => {
    expect(canUndoStatusChange('none', 'owned', 1)).toBe(true);
    expect(canUndoStatusChange('wanted', 'none', 1)).toBe(true);
    expect(canUndoStatusChange('owned', 'for_trade', 3)).toBe(true);
  });

  it('allows undo of removing a single copy', () => {
    expect(canUndoStatusChange('owned', 'none', 1)).toBe(true);
  });

  it('withholds undo when copies would be lost', () => {
    expect(canUndoStatusChange('owned', 'none', 3)).toBe(false);
    expect(canUndoStatusChange('for_trade', 'wanted', 2)).toBe(false);
  });
});
