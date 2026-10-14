/**
 * ScanResult — the single-answer scan result (UX-005, #112): the collector's
 * photo beside the best match, the pin's name and set, then "That's it" and
 * "Not it". "Not it" reveals the other candidates as a strip (tap one to
 * compare it instead) and "None of these". Confidence %, AI reasoning and
 * "what we saw" are scan internals: only admins see them, behind
 * "Scan details" (D-07).
 */
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CataloguePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { PinImage } from '@/components/ui/PinImage';
import { getPinImageSource } from '@/utils/pinImage';
import type { ImageInsights } from '@/utils/identifyPin';
import { radius, spacing } from '@/constants/theme';
import { alternatives, initialResult, notIt, promote, resultHeading } from './scanResult';

export interface ScanCandidate {
  pin: CataloguePin;
  confidence: number;
  reasoning: string;
}

interface ScanResultProps {
  photoUri: string;
  candidates: ScanCandidate[];
  insights: ImageInsights | null;
  /** Admins (and the app creator) can expand the scan details. */
  showDetails: boolean;
  /** "That's it": add this pin (QuickAddSheet), staying on the scan. */
  onConfirm: (pin: CataloguePin) => void;
  /** Tap the matched pin's picture: Pin detail. */
  onOpenPin: (pin: CataloguePin) => void;
  /** "None of these": the recovery options. */
  onNoneOfThese: () => void;
  /** Hide "None of these" once recovery is showing. */
  recoveryOpen?: boolean;
}

const GAP = spacing.md;
const STRIP_TILE = 88;

export function ScanResult({ photoUri, candidates, insights, showDetails, onConfirm, onOpenPin, onNoneOfThese, recoveryOpen }: ScanResultProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [state, setState] = useState(() => initialResult(candidates));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const panel = Math.floor((width - spacing.lg * 2 - GAP) / 2);
  const best = candidates[state.best];
  const others = alternatives(state, candidates.length);

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.homeInk }]}>
        {resultHeading(candidates)}
      </Text>

      <View style={styles.compare}>
        <View style={{ width: panel }}>
          <Image
            source={{ uri: photoUri }}
            style={[styles.panelImage, { width: panel, height: panel, backgroundColor: colors.homeAqua }]}
            accessibilityLabel="Your photo"
          />
          <Text style={[styles.panelLabel, { color: colors.homeMuted }]}>Your photo</Text>
        </View>
        <TouchableOpacity
          style={{ width: panel }}
          onPress={() => onOpenPin(best.pin)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${best.pin.title}. Open pin details`}
        >
          <PinImage
            source={getPinImageSource(best.pin)}
            style={[styles.panelImage, { width: panel, height: panel, backgroundColor: colors.homeAqua }]}
            contentFit="contain"
          />
          <Text style={[styles.panelLabel, { color: colors.homeMuted }]}>Catalogue</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.identity}>
        <Text style={[styles.title, { color: colors.homeInk }]} numberOfLines={2}>{best.pin.title}</Text>
        {best.pin.collection ? (
          <Text style={[styles.set, { color: colors.homeMuted }]} numberOfLines={1}>{best.pin.collection}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {/* Once the alternatives are showing, "Not it" has done its job. */}
        {!state.showAlternatives && (
          <Button label="Not it" icon="x" variant="secondary" onPress={() => setState(s => notIt(s))} style={styles.actionHalf} />
        )}
        <Button label="That's it" icon="check" onPress={() => onConfirm(best.pin)} style={styles.actionHalf} />
      </View>

      {state.showAlternatives && (
        <View style={styles.alternatives}>
          {others.length > 0 && (
            <>
              <Text style={[styles.altHeading, { color: colors.homeMuted }]}>
                {others.length === 1 ? 'Or is it this one?' : 'Or is it one of these?'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                {others.map(i => {
                  const c = candidates[i];
                  return (
                    <TouchableOpacity
                      key={`${c.pin.id}-${i}`}
                      onPress={() => setState(s => promote(s, i, candidates.length))}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Compare ${c.pin.title}`}
                      style={{ width: STRIP_TILE }}
                    >
                      <PinImage
                        source={getPinImageSource(c.pin)}
                        style={[styles.stripImage, { backgroundColor: colors.homeAqua }]}
                        contentFit="contain"
                      />
                      <Text numberOfLines={2} style={[styles.stripTitle, { color: colors.homeInk }]}>{c.pin.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
          {!recoveryOpen && (
            <Button variant="text" label="None of these" onPress={onNoneOfThese} />
          )}
        </View>
      )}

      {showDetails && (
        <View style={[styles.details, { borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}>
          <TouchableOpacity
            onPress={() => setDetailsOpen(o => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            style={styles.detailsToggle}
          >
            <Feather name="sliders" size={14} color={colors.homeMuted} />
            <Text style={[styles.detailsTitle, { color: colors.homeInk }]}>Scan details (admin)</Text>
            <Feather name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.homeMuted} />
          </TouchableOpacity>
          {detailsOpen && (
            <View style={styles.detailsBody}>
              {candidates.map((c, i) => (
                <View key={`${c.pin.id}-${i}`} style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.homeInk }]} numberOfLines={1}>
                    {i + 1}. {c.pin.title} · {c.confidence}%
                  </Text>
                  {c.reasoning ? (
                    <Text style={[styles.detailText, { color: colors.homeMuted }]}>{c.reasoning}</Text>
                  ) : null}
                </View>
              ))}
              {insights && <InsightLines insights={insights} colors={colors} />}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function InsightLines({ insights, colors }: { insights: ImageInsights; colors: ReturnType<typeof useColors> }) {
  const rows: Array<[string, string]> = [];
  if (insights.textOnPin) rows.push(['Text on pin', `“${insights.textOnPin}”`]);
  if (insights.characters.length) rows.push(['Characters', insights.characters.join(', ')]);
  if (insights.logos.length) rows.push(['Logos', insights.logos.join(', ')]);
  if (insights.keywords.length) rows.push(['Looks like', insights.keywords.join(', ')]);
  if (insights.webGuesses.length) rows.push(['Web matches', insights.webGuesses.join(', ')]);
  if (rows.length === 0) return null;
  return (
    <View style={styles.insights}>
      <Text style={[styles.detailLabel, { color: colors.homeInk }]}>What the scan saw</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.insightRow}>
          <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>{label}</Text>
          <Text style={[styles.detailText, styles.insightValue, { color: colors.homeInk }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, gap: spacing.md },
  heading: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  compare: { flexDirection: 'row', gap: GAP },
  panelImage: { borderRadius: radius.lg },
  panelLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginTop: 6 },
  identity: { gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  set: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  actions: { flexDirection: 'row', gap: GAP },
  actionHalf: { flex: 1 },
  alternatives: { gap: spacing.sm },
  altHeading: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  stripImage: { width: STRIP_TILE, height: STRIP_TILE, borderRadius: radius.md },
  stripTitle: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  details: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  detailsTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  detailsBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  detailRow: { gap: 2 },
  detailLabel: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  detailText: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  insights: { gap: 4, marginTop: spacing.xs },
  insightRow: { flexDirection: 'row', gap: spacing.sm },
  insightLabel: { width: 82, fontSize: 12, fontFamily: 'Inter_500Medium' },
  insightValue: { flex: 1 },
});
