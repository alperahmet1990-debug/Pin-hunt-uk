import React from 'react';
import { render } from '@testing-library/react-native';
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

  it('renders the bundled placeholder too (no URL to key on)', async () => {
    await render(<PinImage source={PLACEHOLDER_IMAGE} />);
    expect(mockProps.cachePolicy).toBe('memory-disk');
    expect(mockProps.recyclingKey).toBeUndefined();
  });
});
