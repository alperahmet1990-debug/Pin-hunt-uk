import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SetProgressBarProps {
  /** 0–1 */
  progress: number;
  trackColor: string;
  fillColor: string;
  height?: number;
}

/** Shared completion bar — same visual treatment on Pin Detail's compact set preview and the full Set Detail header. */
export function SetProgressBar({ progress, trackColor, fillColor, height = 6 }: SetProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { backgroundColor: fillColor, width: `${pct}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});
