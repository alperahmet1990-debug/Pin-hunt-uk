import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { usePinActions } from '../components/PinActionsSheet';

const mockSetStatus = jest.fn();
const mockAdjust = jest.fn();
const mockRestore = jest.fn();
const mockAddToBoard = jest.fn();
const mockToast = jest.fn();
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    getEntry: (id: string) => mockCollection[id],
    setStatus: mockSetStatus,
    adjustQuantity: mockAdjust,
    restoreEntry: mockRestore,
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({
    customBoards: [{ id: 'b1', name: 'Favourites', pinIds: [] }],
    addPinToBoard: mockAddToBoard,
    removePinFromBoard: jest.fn(),
  }),
}));

const PIN = { id: 'p1', title: 'Stitch Surfing' };

function Harness() {
  const actions = usePinActions();
  return (
    <View>
      <TouchableOpacity accessibilityRole="button" onLongPress={() => actions.open(PIN)} {...actions.a11y(PIN)}>
        <Text>Stitch tile</Text>
      </TouchableOpacity>
      {actions.sheet}
    </View>
  );
}

const longPress = async () => fireEvent(screen.getByRole('button', { name: 'Stitch tile' }), 'longPress');

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 3 } };
});

describe('Long-press quick actions (UX-016)', () => {
  it('opens a sheet with the current status marked; tapping it again changes nothing', async () => {
    await render(<Harness />);
    expect(screen.queryByRole('radio')).toBeNull();
    await longPress();
    expect(screen.getByRole('header', { name: 'Stitch Surfing' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Owned' }).props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Owned' }));
    expect(mockSetStatus).not.toHaveBeenCalled();
  }, 20_000);

  it('Owned → For Trade applies, closes and offers Undo that restores the exact entry', async () => {
    await render(<Harness />);
    await longPress();
    await fireEvent.press(screen.getByRole('radio', { name: 'For Trade' }));
    expect(mockSetStatus).toHaveBeenCalledWith('p1', 'for_trade');
    expect(screen.queryByRole('radio')).toBeNull();
    const toast = mockToast.mock.calls[0][0];
    expect(toast.message).toBe('Marked as For Trade');
    toast.action.onPress();
    expect(mockRestore).toHaveBeenCalledWith('p1', { pinId: 'p1', status: 'owned', quantity: 3 });
  });

  it('Owned ×3 → ISO asks first, keeping ISO and For Trade distinct', async () => {
    await render(<Harness />);
    await longPress();
    await fireEvent.press(screen.getByRole('radio', { name: 'ISO' }));
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/no longer own ×3 copies/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Move to ISO' }));
    expect(mockSetStatus).toHaveBeenCalledWith('p1', 'wanted');
  });

  it('adjusts copies and adds to a board without closing', async () => {
    await render(<Harness />);
    await longPress();
    await fireEvent.press(screen.getByRole('button', { name: 'One more copy' }));
    expect(mockAdjust).toHaveBeenCalledWith('p1', 1);
    await fireEvent.press(screen.getByRole('button', { name: /Add to board/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Favourites' }));
    expect(mockAddToBoard).toHaveBeenCalledWith('b1', 'p1');
    expect(screen.getByRole('header', { name: 'Stitch Surfing' })).toBeTruthy();
  });

  it('Remove needs a confirmation', async () => {
    await render(<Harness />);
    await longPress();
    await fireEvent.press(screen.getByRole('button', { name: /Remove from my collection/ }));
    expect(mockSetStatus).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(mockSetStatus).toHaveBeenCalledWith('p1', 'none');
  });

  it('exposes the actions to VoiceOver on the tile', async () => {
    await render(<Harness />);
    const tile = screen.getByRole('button', { name: 'Stitch tile' });
    expect(tile.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['Quick actions', 'Add to ISO', 'Mark as For Trade']);
    await fireEvent(tile, 'accessibilityAction', { nativeEvent: { actionName: 'for_trade' } });
    expect(mockSetStatus).toHaveBeenCalledWith('p1', 'for_trade');
    // Dropping ×3 copies goes through the sheet's confirmation instead.
    await fireEvent(tile, 'accessibilityAction', { nativeEvent: { actionName: 'wanted' } });
    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'Stitch Surfing' })).toBeTruthy();
  });
});
