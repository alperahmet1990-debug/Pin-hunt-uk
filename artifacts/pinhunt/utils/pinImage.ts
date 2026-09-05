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
// A neutral "no photo" glyph — never a real pin's photo, so a missing
// catalogue image is never mistaken for that pin's genuine artwork.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const PLACEHOLDER_IMAGE = require('../assets/images/pins/pin-image-unavailable.png') as ImageSourcePropType;
