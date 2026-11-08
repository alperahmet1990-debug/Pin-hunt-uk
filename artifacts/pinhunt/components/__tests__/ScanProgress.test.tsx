import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ScanProgress, scanProgressIndex, SCAN_PROGRESS_STEPS } from '../scan/ScanProgress';

// The scan shows what it's doing while it waits (TestFlight feedback, 8 Nov).

describe('scan progress steps', () => {
  it('follows typical staging step times', () => {
    expect(SCAN_PROGRESS_STEPS.map(s => s.label)).toEqual([
      'Looking at your pin…', 'Searching the catalogue…', 'Comparing with catalogue photos…', 'Almost there…',
    ]);
    expect(scanProgressIndex(0)).toBe(0);
    expect(scanProgressIndex(3_499)).toBe(0);
    expect(scanProgressIndex(3_500)).toBe(1);
    expect(scanProgressIndex(9_000)).toBe(2);
    expect(scanProgressIndex(25_000)).toBe(3);
  });

  it('moves through the steps while it is shown', async () => {
    jest.useFakeTimers();
    try {
      await render(<ScanProgress color="#fff" dimColor="#999" />);
      expect(screen.getByText('Looking at your pin…')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(4_000); });
      expect(screen.getByText('Searching the catalogue…')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(6_000); });
      expect(screen.getByText('Comparing with catalogue photos…')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(12_000); });
      expect(screen.getByText('Almost there…')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
