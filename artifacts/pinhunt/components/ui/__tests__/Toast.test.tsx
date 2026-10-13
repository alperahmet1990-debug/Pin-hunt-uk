import React from 'react';
import { AccessibilityInfo, Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ToastHost, ToastProvider, TOAST_DURATION_MS, useToast } from '../Toast';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function Trigger({ undo }: { undo?: () => void }) {
  const toast = useToast();
  return (
    <TouchableOpacity
      onPress={() => toast.show({ message: 'Added to your ISO', action: undo ? { label: 'Undo', onPress: undo } : undefined })}
    >
      <Text>show</Text>
    </TouchableOpacity>
  );
}

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the message, announces it, and hides itself after the duration', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<ToastProvider><Trigger undo={() => {}} /><ToastHost /></ToastProvider>);
    await act(async () => { fireEvent.press(screen.getByText('show')); });
    expect(screen.getByText('Added to your ISO')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Added to your ISO. Undo available.');
    await act(async () => { jest.advanceTimersByTime(TOAST_DURATION_MS + 1); });
    expect(screen.queryByText('Added to your ISO')).toBeNull();
  });

  it('runs the action once and dismisses', async () => {
    const undo = jest.fn();
    await render(<ToastProvider><Trigger undo={undo} /><ToastHost /></ToastProvider>);
    await act(async () => { fireEvent.press(screen.getByText('show')); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Undo' })); });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Added to your ISO')).toBeNull();
  });

  it('draws in the most recently mounted host only (e.g. inside a sheet)', async () => {
    await render(
      <ToastProvider>
        <Trigger />
        <ToastHost />
        <ToastHost placement="top" />
      </ToastProvider>,
    );
    await act(async () => { fireEvent.press(screen.getByText('show')); });
    expect(screen.getAllByText('Added to your ISO')).toHaveLength(1);
  });

  it('is a no-op outside the provider', async () => {
    await render(<Trigger />);
    await act(async () => { fireEvent.press(screen.getByText('show')); });
    expect(screen.queryByText('Added to your ISO')).toBeNull();
  });
});
