jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardStickyView: require('react-native').View }));
import { dropsCopies, removalConsequence, statusChangeMessage } from '../QuickAddSheet';

describe('QuickAddSheet toast copy', () => {
  it.each([
    ['none', 'owned', 'Added to your collection as Owned'],
    ['wanted', 'for_trade', 'Added to your collection as For Trade'],
    ['owned', 'for_trade', 'Marked as For Trade'],
    ['none', 'wanted', 'Added to your ISO'],
    ['owned', 'wanted', 'Moved to your ISO'],
    ['owned', 'none', 'Removed from your collection'],
    ['wanted', 'none', 'Removed from your ISO'],
  ] as const)('%s → %s: "%s"', (prev, next, text) => {
    expect(statusChangeMessage(prev, next)).toBe(text);
  });
});

describe('dropsCopies', () => {
  it('asks first only when Owned/For Trade ×N moves to ISO', () => {
    expect(dropsCopies('owned', 'wanted', 3)).toBe(true);
    expect(dropsCopies('for_trade', 'wanted', 2)).toBe(true);
    expect(dropsCopies('owned', 'wanted', 1)).toBe(false);
    expect(dropsCopies('owned', 'for_trade', 3)).toBe(false);
    expect(dropsCopies('none', 'wanted', 1)).toBe(false);
  });
});

describe('removalConsequence', () => {
  it('names the copies and boards at stake', () => {
    expect(removalConsequence('remove', 'owned', 3, 2)).toBe("You'll no longer own ×3 copies and it leaves 2 boards. You can undo this.");
    expect(removalConsequence('toIso', 'for_trade', 2, 0)).toBe("You'll no longer own ×2 copies. You can undo this.");
    expect(removalConsequence('remove', 'owned', 1, 1)).toBe("You'll no longer own this pin and it leaves 1 board. You can undo this.");
    expect(removalConsequence('remove', 'wanted', 1, 0)).toBe('It comes off your ISO. You can undo this.');
  });
});
