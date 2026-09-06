/**
 * Avatar — shows a profile photo when available, falls back to a coloured
 * initials circle. Used everywhere a user's face would appear.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface AvatarProps {
  /** Remote URL or local URI for the photo. Omit (or pass null) for initials. */
  uri?: string | null;
  /** Display name or username — used to derive initials when no photo. */
  name: string;
  /** Diameter in pixels. */
  size: number;
  /** Optional extra style applied to the outer container. */
  style?: ViewStyle;
  /** Renders with the collector-app palette instead of the legacy default (see QuickAddSheet for the same pattern). */
  seaGlass?: boolean;
}

function getInitials(name: string): string {
  return (name || '?')
    .split(/[\s@._-]+/)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || '?';
}

export function Avatar({ uri, name, size, style, seaGlass = false }: AvatarProps) {
  const colors = useColors();
  const radius = size / 2;
  const [imgError, setImgError] = useState(false);

  const showInitials = !uri || imgError;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: seaGlass ? colors.homeTeal : colors.primary,
        },
        styles.wrap,
        style,
      ]}
    >
      {!showInitials ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}
          allowFontScaling={false}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Inter_700Bold', color: '#fff', includeFontPadding: false },
});
