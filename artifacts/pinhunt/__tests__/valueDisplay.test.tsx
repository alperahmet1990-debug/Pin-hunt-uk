import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ValueDisplay } from '../components/ui/ValueDisplay';

// A catalogued pin with no estimate must not read "Not yet catalogued" (#461).
jest.mock('@/components/MarketValueSection', () => ({ MarketValueSection: () => null }));

describe('ValueDisplay (#461)', () => {
  it('says "No value yet" when there is no estimate', async () => {
    await render(<ValueDisplay pinId="p1" catalogueEstimateGBP={null} />);
    expect(screen.getByText('No value yet')).toBeTruthy();
    expect(screen.queryByText(/Not yet catalogued/)).toBeNull();
  });

  it('shows the estimate exactly as before when there is one', async () => {
    await render(<ValueDisplay pinId="p1" catalogueEstimateGBP={12.5} />);
    expect(screen.getByText('£12.50')).toBeTruthy();
    expect(screen.queryByText('No value yet')).toBeNull();
  });
});
