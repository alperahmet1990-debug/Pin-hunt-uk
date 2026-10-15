import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScreenHeader } from '../ScreenHeader';

// UX-040 (#153): one header for pin, set, board, search, collector and Find Trades.
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

beforeEach(() => jest.clearAllMocks());

describe('ScreenHeader', () => {
  it('has a 44 pt Back read as "Back", and a one-line title', async () => {
    await render(<ScreenHeader title="Find Trades" />);
    const back = screen.getByRole('button', { name: 'Back' });
    const size = StyleSheet.flatten(back.props.style);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(screen.getByRole('header', { name: 'Find Trades' }).props.numberOfLines).toBe(1);
  });

  it('goes back, or Home when there is nothing to go back to', async () => {
    await render(<ScreenHeader />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('uses onBack when given', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader onBack={onBack} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('pads for the status bar unless the screen already does', async () => {
    const row = () => screen.getByTestId('screen-header');
    await render(<ScreenHeader />);
    expect(StyleSheet.flatten(row().props.style).paddingTop).toBeGreaterThanOrEqual(47);
    await render(<ScreenHeader safeArea={false} />);
    expect(StyleSheet.flatten(row().props.style).paddingTop).toBeLessThan(47);
  });

  it('floats over a hero image in overlay mode, with trailing content', async () => {
    await render(<ScreenHeader overlay right={<Text>LE 500</Text>} />);
    expect(screen.getByText('LE 500')).toBeTruthy();
    const style = StyleSheet.flatten(screen.getByTestId('screen-header').props.style);
    expect(style.position).toBe('absolute');
  });

  it('puts children (e.g. a search field) in place of the title', async () => {
    await render(<ScreenHeader title="Ignored"><Text>Field</Text></ScreenHeader>);
    expect(screen.getByText('Field')).toBeTruthy();
    expect(screen.queryByRole('header')).toBeNull();
  });
});
