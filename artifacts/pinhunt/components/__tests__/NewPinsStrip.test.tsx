import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { CatalogueImageCoverage } from '@workspace/pin-repository';

const mockPush = jest.fn();
let mockEnabled = true;
let mockRows: CatalogueImageCoverage[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: mockEnabled, loading: false }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  useNewestNeedingPhotos: (enabled: boolean) => ({ rows: enabled ? mockRows : [], loading: false, refresh: jest.fn() }),
}));

import { NewPinsStrip } from '../NewPinsStrip';

const row = (id: string, title: string): CatalogueImageCoverage => ({
  pinhuntId: id, title, setName: 'Festive 2026', imageSource: null, pendingCount: 0, catalogueSource: 'pin_and_pop',
});

describe('NewPinsStrip (Home "New to the catalogue")', () => {
  beforeEach(() => {
    mockEnabled = true;
    mockRows = [row('PHUK-10000009', 'Stitch Snowman'), row('PHUK-10000008', 'Mickey Wreath')];
    mockPush.mockClear();
  });

  it('lists the newest pins needing a photo and opens the photo flow for one', async () => {
    await render(<NewPinsStrip />);
    expect(screen.getByText('New to the catalogue')).toBeTruthy();
    expect(screen.getByText('Stitch Snowman')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('Mickey Wreath, Festive 2026. Needs a photo. Add one')); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/contribute-image/[pinId]', params: { pinId: 'PHUK-10000008', from: 'catalogue' } });
  });

  it('See all opens Contribute pictures, newest first, needing a photo', async () => {
    await render(<NewPinsStrip />);
    await act(async () => { fireEvent.press(screen.getByLabelText('See all new pins that need a photo')); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/contribute', params: { sort: 'newest', filter: 'needs' } });
  });

  it('is hidden when there is nothing to show or the person cannot contribute', async () => {
    mockRows = [];
    const first = await render(<NewPinsStrip />);
    expect(first.queryByTestId('home-new-pins')).toBeNull();
    first.unmount();
    mockRows = [row('PHUK-1', 'X')];
    mockEnabled = false;
    await render(<NewPinsStrip />);
    expect(screen.queryByTestId('home-new-pins')).toBeNull();
  });
});
