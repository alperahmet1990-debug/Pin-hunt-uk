import type { ImageSourcePropType } from 'react-native';
import type { CataloguePin } from '@workspace/pin-repository';

/**
 * Returns a React Native ImageSourcePropType for a catalogue pin.
 * Uses the remote imageUrl when available; falls back to a bundled placeholder.
 *
 * All components must call this instead of accessing pin.imageUrl directly
 * so the fallback logic is centralised.
 */
export function getPinImageSource(pin: CataloguePin): ImageSourcePropType {
  if (pin.imageUrl) {
    return { uri: pin.imageUrl };
  }
  return PLACEHOLDER_IMAGE;
}

// Single bundled placeholder used when a pin has no catalogue image yet.
// Replace with a proper placeholder asset once designed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const PLACEHOLDER_IMAGE = require('../assets/images/pins/pin-01.png') as ImageSourcePropType;
