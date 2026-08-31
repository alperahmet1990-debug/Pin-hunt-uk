import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface ScreenContainerProps {
  children: React.ReactNode;
  /** Pad for the safe area on each edge. Defaults to true/true — disable when a screen manages its own inset (e.g. an image bleeding under the status bar, or a sticky bottom bar already padding for it). */
  edges?: { top?: boolean; bottom?: boolean };
  style?: StyleProp<ViewStyle>;
}

/** Sea Glass background + safe-area shell shared by Home and other screens adopting the design system. Screens own their own scrolling/layout inside it. */
export function ScreenContainer({ children, edges = { top: true, bottom: true }, style }: ScreenContainerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = edges.top ? (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) : 0;
  const bottomPad = edges.bottom ? (Platform.OS === 'web' ? 34 : insets.bottom) : 0;

  return (
    <View style={[{ flex: 1, backgroundColor: colors.homeBackground, paddingTop: topPad, paddingBottom: bottomPad }, style]}>
      {children}
    </View>
  );
}
