/**
 * What the scan is doing while the photo is identified (TestFlight feedback,
 * 8 Nov 2026: "Analysing with AI" felt very slow).
 *
 * The server answers in one go, so the steps follow typical staging timings
 * (#532, #535): describing the photo ~3 s, ranking ~5 s, comparing with
 * catalogue photos the rest when it runs. They describe the kind of work
 * being done, not a measured position, so they never claim "done".
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface ScanProgressStep {
  /** Shown from this many ms after the photo is sent. */
  from: number;
  label: string;
}

export const SCAN_PROGRESS_STEPS: readonly ScanProgressStep[] = [
  { from: 0, label: 'Looking at your pin…' },
  { from: 3_500, label: 'Searching the catalogue…' },
  { from: 9_000, label: 'Comparing with catalogue photos…' },
  { from: 20_000, label: 'Almost there…' },
];

/** Index of the step to show after `elapsedMs`. */
export function scanProgressIndex(elapsedMs: number): number {
  let index = 0;
  SCAN_PROGRESS_STEPS.forEach((step, i) => { if (elapsedMs >= step.from) index = i; });
  return index;
}

/** Counts from when it mounts; remount (change `key`) for each new scan. */
export function ScanProgress({ color, dimColor }: { color: string; dimColor: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, []);
  const index = scanProgressIndex(elapsed);
  // The last step is a reassurance, not a stage of its own.
  const stages = SCAN_PROGRESS_STEPS.length - 1;

  return (
    <View style={styles.wrap}>
      <Text accessibilityLiveRegion="polite" accessibilityRole="text" style={[styles.label, { color }]}>
        {SCAN_PROGRESS_STEPS[index].label}
      </Text>
      <View style={styles.dots} accessible={false}>
        {Array.from({ length: stages }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= Math.min(index, stages - 1) ? color : dimColor }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 18, height: 4, borderRadius: 2 },
});
