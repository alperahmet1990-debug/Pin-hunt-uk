import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { usePinSearch, PIN_SEARCH_DEBOUNCE_MS } from '../usePinSearch';

// #25: pin pickers search the catalogue instead of filtering a preloaded list.
let mockRepository: { searchPinsPage: jest.Mock } | null = null;
const mockPins = [
  { id: 'm1', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
  { id: 'm2', title: 'Castle Fireworks', collection: 'Park Icons' },
];
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ repository: mockRepository, pins: mockPins }),
}));

function Probe({ q }: { q: string }) {
  const { results } = usePinSearch(q, 5);
  return <Text>{results.map(p => p.title).join(', ') || 'none'}</Text>;
}

describe('usePinSearch (#25)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks the server after a short pause', async () => {
    mockRepository = { searchPinsPage: jest.fn(() => Promise.resolve({ pins: [{ id: 's1', title: 'Stitch Valentine', collection: 'Hearts' }], total: 1 })) };
    await render(<Probe q="stitch" />);
    expect(mockRepository.searchPinsPage).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(PIN_SEARCH_DEBOUNCE_MS); });
    expect(mockRepository.searchPinsPage).toHaveBeenCalledWith('stitch', { limit: 5, offset: 0 });
    expect(screen.getByText('Stitch Valentine')).toBeTruthy();
  });

  it('searches nothing for an empty query', async () => {
    mockRepository = { searchPinsPage: jest.fn() };
    await render(<Probe q="  " />);
    await act(async () => { jest.advanceTimersByTime(PIN_SEARCH_DEBOUNCE_MS); });
    expect(mockRepository.searchPinsPage).not.toHaveBeenCalled();
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('filters the mock catalogue in demo mode', async () => {
    mockRepository = null;
    await render(<Probe q="dumbo" />);
    expect(screen.getByText('Dumbo Blue Sky')).toBeTruthy();
  });
});
