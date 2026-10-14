/**
 * PinImage — every catalogue pin image goes through here (B-P1-14a, #39).
 * expo-image with a memory + disk cache, so a pin's photo downloads once
 * per device instead of on every view, and a recyclingKey so recycled list
 * cells never flash the previous pin's photo.
 *
 * Not for user photos (community posts, uploads, private submissions):
 * those aren't catalogue images and some use short-lived signed URLs.
 */
import React from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

export type PinImageProps = Omit<ImageProps, 'source' | 'cachePolicy' | 'recyclingKey'> & {
  source: ImageSourcePropType;
  /** Defaults to the image URL; pass the pin id when the URL can be shared. */
  recyclingKey?: string;
};

/** The URL of a remote source, if it has one. */
function sourceUri(source: ImageSourcePropType): string | undefined {
  if (source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
    return source.uri ?? undefined;
  }
  return undefined;
}

export function PinImage({ source, recyclingKey, contentFit = 'cover', ...rest }: PinImageProps) {
  return (
    <Image
      {...rest}
      source={source as ImageProps['source']}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? sourceUri(source)}
    />
  );
}
