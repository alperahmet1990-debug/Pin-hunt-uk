import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PinImage } from '../PinImage';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';

// B-P1-14a (#39): catalogue pin images are cached on the device.
let mockProps: Record<string, unknown> = {};
jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => { mockProps = props; return null; },
}));
describe('PinImage', () => {
  it('caches to memory and disk, keyed by the image URL', async () => {
    await render(<PinImage source={{ uri: 'https://example.test/p1.jpg' }} style={{ width: 44, height: 44 }} />);
    expect(mockProps.cachePolicy).toBe('memory-disk');
    expect(mockProps.recyclingKey).toBe('https://example.test/p1.jpg');
    expect(mockProps.contentFit).toBe('cover');
  });

  it('takes an explicit recycling key and content fit', async () => {
    await render(<PinImage source={{ uri: 'https://example.test/p1.jpg' }} recyclingKey="PHUK-00000001" contentFit="contain" />);
    expect(mockProps.recyclingKey).toBe('PHUK-00000001');
    expect(mockProps.contentFit).toBe('contain');
  });

  // UX-066 (#308): no photo → the drawn placeholder, read as "No photo yet".
  it('draws the no-photo placeholder instead of an image', async () => {
    mockProps = {};
    await render(<PinImage source={PLACEHOLDER_IMAGE} style={{ width: 44, height: 44 }} />);
    expect(mockProps).toEqual({});
    expect(screen.getByTestId('no-photo-placeholder')).toBeTruthy();
    expect(screen.getByLabelText('No photo yet')).toBeTruthy();
  });

  it('names the pin with the placeholder, or stays silent inside a labelled tile', async () => {
    await render(<PinImage source={PLACEHOLDER_IMAGE} accessibilityLabel="Dumbo Blue Sky" />);
    expect(screen.getByLabelText('Dumbo Blue Sky. No photo yet')).toBeTruthy();
    await render(<PinImage source={PLACEHOLDER_IMAGE} accessible={false} />);
    expect(screen.queryByLabelText('No photo yet')).toBeNull();
  });
});
