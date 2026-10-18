import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ContributeCatalogueScreen from '../app/contribute';

// Explore & improve (#396): the whole verified catalogue, filtered by year,
// park, character and set, and by what's needed.
const mockRows = [
  { pinhuntId: 'PHUK-1', title: 'Mickey Castle', setName: 'Park Icons', releaseYear: 2024, origin: 'Disneyland Paris',
    allCharacters: 'Mickey', imageSource: null, pendingCount: 0, missingFields: [] },
  { pinhuntId: 'PHUK-2', title: 'Stitch Surf', setName: 'Ohana', releaseYear: 2022, origin: 'Walt Disney World',
    allCharacters: 'Stitch', imageSource: 'reference', imageUrl: 'https://x/2.jpg', pendingCount: 0, missingFields: ['release_year', 'origin'] },
  { pinhuntId: 'PHUK-3', title: 'Stitch Ohana', setName: 'Ohana', releaseYear: 2024, origin: 'Disneyland Paris',
    allCharacters: 'Stitch', imageSource: 'reference', imageUrl: 'https://x/3.jpg', pendingCount: 0, needsBackImage: true },
];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: true, loading: false }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  useCatalogueCoverage: () => ({ rows: mockRows, loading: false, error: null, refresh: jest.fn() }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));

describe('Explore & improve filters (#396)', () => {
  it('filters by year from the sheet, and by what is needed', async () => {
    await render(<ContributeCatalogueScreen />);
    expect(screen.getByText('Mickey Castle')).toBeTruthy();
    expect(screen.getByText('Stitch Surf')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Year: any' }));
    await fireEvent.press(screen.getByText('2024 (2)'));
    expect(screen.queryByText('Stitch Surf')).toBeNull();
    expect(screen.getByText('Stitch Ohana')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Year: 2024' })).toBeTruthy();

    await fireEvent.press(screen.getByText(/Needs back photo/));
    expect(screen.queryByText('Mickey Castle')).toBeNull();
    expect(screen.getByText('Stitch Ohana')).toBeTruthy();
  });

  it('"Missing info" shows what each pin lacks', async () => {
    await render(<ContributeCatalogueScreen />);
    await fireEvent.press(screen.getByText(/Missing info/));
    expect(screen.getByText('Stitch Surf')).toBeTruthy();
    expect(screen.getByText('Missing: year, park')).toBeTruthy();
    expect(screen.queryByText('Mickey Castle')).toBeNull();
  });
});
