/**
 * "Get started" checklist on Home for new collectors (UX-002, #109). Four
 * steps that tick themselves off from the collection; hidden for good once
 * all are done or the collector taps Hide. When it isn't showing, Home falls
 * back to the zero-pins "Add the pins you own" card (#207), so there's only
 * ever one starter card.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { useCollection } from '@/context/CollectionContext';
import { AddPinsCard } from '@/components/AddPinsCard';
import {
  getStartedKey,
  getStartedSteps,
  initialGetStartedState,
  parseGetStartedState,
  shouldShowGetStarted,
  type GetStartedState,
  type GetStartedStep,
} from '@/utils/getStarted';

export function GetStartedCard() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { collection } = useCollection();
  const userId = user?.id;
  const entries = Object.values(collection);
  const [state, setState] = useState<GetStartedState | null>(null);
  const [checked, setChecked] = useState(false);

  // Load (or decide once and save) this account's checklist state.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(getStartedKey(userId))
      .then(raw => {
        if (cancelled) return;
        let next = parseGetStartedState(raw);
        if (!next) {
          next = initialGetStartedState(entries.length, profile?.createdAt);
          AsyncStorage.setItem(getStartedKey(userId), JSON.stringify(next)).catch(() => {});
        }
        setState(next);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
    // Decided once per account; later collection changes only tick steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const steps = useMemo(
    () => getStartedSteps(Object.values(collection).map(e => e.status), !!state?.matchesSeen),
    [collection, state?.matchesSeen],
  );

  const save = (patch: Partial<GetStartedState>) => {
    setState(prev => {
      const next = { ...(prev ?? { eligible: true }), ...patch };
      if (userId) AsyncStorage.setItem(getStartedKey(userId), JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  if (!checked) return null;
  if (!shouldShowGetStarted(state, steps)) return <AddPinsCard />;

  const doneCount = steps.filter(s => s.done).length;
  const next = steps.find(s => !s.done);
  const open = (step: GetStartedStep) => {
    if (step.id === 'matches') save({ matchesSeen: true });
    router.push(step.route);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>Get started</Text>
          <Text style={[styles.progress, { color: colors.homeMuted }]}>{doneCount} of {steps.length} done</Text>
        </View>
        <TouchableOpacity
          onPress={() => save({ dismissed: true })}
          accessibilityRole="button"
          accessibilityLabel="Hide Get started"
          hitSlop={6}
          style={styles.hide}
        >
          <Text style={[styles.hideLabel, { color: colors.homeMuted }]}>Hide</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.track, { backgroundColor: colors.homeAqua }]}>
        <View style={[styles.fill, { backgroundColor: colors.homeCoral, width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>
      {steps.map(step => {
        const isNext = step === next;
        return (
          <TouchableOpacity
            key={step.id}
            onPress={() => open(step)}
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. ${step.detail}.${step.done ? ' Done.' : ''}`}
            activeOpacity={0.8}
            style={[styles.step, { borderTopColor: colors.homeLine }]}
          >
            <View style={[
              styles.tick,
              step.done
                ? { backgroundColor: colors.owned, borderColor: colors.owned }
                : { borderColor: isNext ? colors.homeCoral : colors.homeLine },
            ]}>
              {step.done && <Feather name="check" size={13} color={colors.homeSurface} />}
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: step.done ? colors.homeMuted : colors.homeInk }, step.done && styles.doneTitle]}>
                {step.title}
              </Text>
              {!step.done && <Text style={[styles.stepDetail, { color: colors.homeMuted }]}>{step.detail}</Text>}
            </View>
            {!step.done && <Feather name="chevron-right" size={18} color={isNext ? colors.homeCoralDeep : colors.homeMuted} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center' },
  headText: { flex: 1 },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  progress: { fontSize: 11.5, fontFamily: 'Inter_500Medium', marginTop: 1 },
  hide: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hideLabel: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 4, marginBottom: 8 },
  fill: { height: '100%', borderRadius: 3 },
  step: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, minWidth: 0 },
  stepTitle: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  doneTitle: { textDecorationLine: 'line-through' },
  stepDetail: { fontSize: 11.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
