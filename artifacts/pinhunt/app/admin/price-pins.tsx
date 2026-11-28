/**
 * Price Pins (App Creator) — get eBay UK/US sold prices for many pins at
 * once, from the app. The API server runs the same capped batch as
 * scripts/market-price-batch.mjs (POST /api/admin/price-batch/*), so no
 * local env file or script is needed.
 *
 * Flow: choose pins (most collected, or pasted PinHunt IDs), the re-check
 * window (default 30 days: pins answered more recently are skipped for free)
 * and a credit ceiling → "Check cost" (free) → confirm → the run goes on in
 * the background; this screen polls it and can stop it. Running the same
 * selection again carries on where a stopped run left off.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { radius, spacing } from '@/constants/theme';
import { Button, ConfirmDialog, SegmentedControl, type SegmentedControlOption } from '@/components/ui';

type Mode = 'popular' | 'ids';

interface Counts { priced: number; noSales: number; cached: number; inFlight: number; failed: number; notFound: number }
interface Job {
  state: 'running' | 'finished' | 'failed';
  startedAt: string;
  finishedAt?: string;
  selection: string;
  markets: string[];
  plannedCredits: number;
  pinsToTry: number;
  tried: number;
  creditsSpent: number;
  counts: Counts;
  stopRequested: boolean;
  stoppedBy?: string;
  stopDetail?: string;
  budgetAfter?: { usedCredits: number; limitCredits: number };
}
interface Setup {
  markets: string[];
  switches: { soldgraph: boolean; valuationV2: boolean };
  month: string;
  budget: { usedCredits: number; limitCredits: number; hardStop: boolean } | null;
  job: Job | null;
}
interface Plan {
  candidates: number;
  alreadyAnswered: number;
  toPrice: number;
  creditsPerPin: number;
  pinsThisRun: number;
  plannedCredits: number;
  budget: { usedCredits: number; limitCredits: number; hardStop: boolean };
  spendable: number | null;
}

const MODES: SegmentedControlOption<Mode>[] = [
  { value: 'popular', label: 'Most collected', icon: 'trending-up', tone: 'coralDeep' },
  { value: 'ids', label: 'PinHunt IDs', icon: 'list', tone: 'sand' },
];

const POLL_MS = 4000;
const USD_PER_CREDIT = 0.0045;

const STOP_LABEL: Record<string, string> = {
  ceiling: 'reached the credit ceiling',
  budget: 'the monthly budget ran out',
  unavailable: 'pricing became unavailable',
  errors: 'too many failures in a row',
  stopped: 'you stopped it',
};

export default function PricePinsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [setup, setSetup] = useState<Setup | null>(null);
  const [mode, setMode] = useState<Mode>('popular');
  const [count, setCount] = useState('100');
  const [ids, setIds] = useState('');
  const [cacheDays, setCacheDays] = useState('30');
  const [maxCredits, setMaxCredits] = useState('200');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const call = useCallback(async (path: string, body?: unknown) => {
    const r = await fetch(`${API_BASE}/admin/price-batch${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }, [token]);

  const loadSetup = useCallback(async () => {
    try {
      const { status, data } = await call('');
      if (status !== 200) { setError(data.error ?? `Couldn't load (HTTP ${status}).`); return; }
      setSetup(data as Setup);
    } catch {
      setError('Couldn’t reach the API server.');
    }
  }, [call]);

  useEffect(() => { void loadSetup(); }, [loadSetup]);

  // Poll while a run is going.
  const running = setup?.job?.state === 'running';
  useEffect(() => {
    if (!running) return;
    poll.current = setInterval(() => { void loadSetup(); }, POLL_MS);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [running, loadSetup]);

  const body = () => ({
    pins: mode === 'popular' ? { kind: 'popular', count: Number(count) } : { kind: 'ids', pinhuntIds: ids },
    cacheDays: Number(cacheDays),
    maxCredits: Number(maxCredits),
  });

  // Any change to the inputs makes the shown cost stale.
  useEffect(() => { setPlan(null); setBlockers([]); }, [mode, count, ids, cacheDays, maxCredits]);

  const checkCost = async () => {
    setBusy(true);
    setError(null);
    try {
      const { status, data } = await call('/plan', body());
      if (status !== 200) { setError(data.error ?? `Couldn't check the cost (HTTP ${status}).`); return; }
      setPlan(data.plan as Plan);
      setBlockers(data.blockers ?? []);
    } catch {
      setError('Couldn’t reach the API server.');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!plan) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const { status, data } = await call('/run', { ...body(), confirmCredits: plan.plannedCredits });
      if (status === 202 || status === 409) {
        setPlan(null);
        await loadSetup();
        return;
      }
      if (status === 422) { setBlockers(data.blockers ?? []); if (data.plan) setPlan(data.plan); return; }
      setError(data.error ?? `Couldn't start (HTTP ${status}).`);
    } catch {
      setError('Couldn’t reach the API server.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    try {
      await call('/stop', {});
      await loadSetup();
    } catch {
      setError('Couldn’t reach the API server.');
    }
  };

  const job = setup?.job ?? null;
  const ink = { color: colors.homeInk };
  const muted = { color: colors.homeMuted };
  const card = [styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }];
  const input = [styles.input, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }];
  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: 'Price Pins' }} />
      <ScrollView
        style={{ backgroundColor: colors.homeBackground }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: botPad, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, muted]}>
          Get eBay sold prices for many pins at once. Each pin costs up to 1 Soldgraph credit per market. Pins priced within the
          re-check window are skipped for free, so running this again each month only checks for new sales.
        </Text>

        {/* Setup */}
        <View style={card} testID="price-pins-setup">
          <Text style={[styles.kicker, muted]}>SETUP</Text>
          {!setup ? (
            error ? <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator color={colors.homeCoral} />
          ) : (
            <>
              <Line label="Markets" value={setup.markets.length ? setup.markets.join(', ') : 'None published'} ok={setup.markets.length > 0} />
              <Line label="Soldgraph" value={setup.switches.soldgraph ? 'On' : 'Off'} ok={setup.switches.soldgraph} />
              <Line label="Saving prices" value={setup.switches.valuationV2 ? 'On' : 'Off'} ok={setup.switches.valuationV2} />
              <Line
                label={`Budget ${setup.month}`}
                value={setup.budget
                  ? `${setup.budget.usedCredits} of ${setup.budget.limitCredits} used${setup.budget.hardStop ? '' : ' (not a hard stop)'}`
                  : 'Not readable'}
                ok={Boolean(setup.budget?.hardStop)}
              />
            </>
          )}
        </View>

        {/* Current or last run */}
        {job && (
          <View style={card} testID="price-pins-job">
            <Text style={[styles.kicker, muted]}>{job.state === 'running' ? 'RUNNING' : 'LAST RUN'}</Text>
            <Text style={[styles.title, ink]}>
              {job.selection} · {job.markets.join(' + ')}
            </Text>
            <Text style={[styles.body, ink]}>
              {job.tried} of {job.pinsToTry} pins · {job.creditsSpent} of {job.plannedCredits} credits
            </Text>
            <Text style={[styles.body, muted]}>
              Priced {job.counts.priced} · no sales {job.counts.noSales} · already answered {job.counts.cached} · failed {job.counts.failed}
            </Text>
            {job.state !== 'running' && (
              <Text style={[styles.body, muted]}>
                {job.state === 'failed' ? 'Stopped with a problem' : job.stoppedBy ? `Stopped: ${STOP_LABEL[job.stoppedBy] ?? job.stoppedBy}` : 'Finished'}
                {job.stopDetail && job.stoppedBy !== 'stopped' ? ` (${job.stopDetail})` : ''}.
                {job.stoppedBy && job.stoppedBy !== 'ceiling' ? ' Run it again to carry on.' : ''}
              </Text>
            )}
            {job.budgetAfter && (
              <Text style={[styles.body, muted]}>Budget after: {job.budgetAfter.usedCredits} of {job.budgetAfter.limitCredits} credits.</Text>
            )}
            {job.state === 'running' && (
              <Button
                label={job.stopRequested ? 'Stopping after this pin…' : 'Stop'}
                variant="secondary"
                onPress={stop}
                disabled={job.stopRequested}
              />
            )}
          </View>
        )}

        {/* New run */}
        <View style={card}>
          <Text style={[styles.kicker, muted]}>WHICH PINS</Text>
          <SegmentedControl options={MODES} value={mode} onChange={setMode} />
          {mode === 'popular' ? (
            <Field label="How many (most owned, for trade and ISO first)">
              <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" style={input} accessibilityLabel="How many pins" />
            </Field>
          ) : (
            <Field label="PinHunt IDs (one per line, or separated by commas)">
              <TextInput
                value={ids}
                onChangeText={setIds}
                multiline
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="PHUK-00000001"
                placeholderTextColor={colors.homeMuted}
                style={[input, styles.multiline]}
                accessibilityLabel="PinHunt IDs"
              />
            </Field>
          )}
          <View style={styles.row}>
            <Field label="Re-check after (days)" flex>
              <TextInput value={cacheDays} onChangeText={setCacheDays} keyboardType="number-pad" style={input} accessibilityLabel="Re-check after days" />
            </Field>
            <Field label="Credit ceiling" flex>
              <TextInput value={maxCredits} onChangeText={setMaxCredits} keyboardType="number-pad" style={input} accessibilityLabel="Credit ceiling" />
            </Field>
          </View>

          <Button label="Check cost" variant="secondary" onPress={checkCost} loading={busy && !plan} disabled={busy || running} />

          {plan && (
            <View style={[styles.plan, { backgroundColor: colors.homeAqua }]} testID="price-pins-plan">
              <Text style={[styles.body, ink]}>
                {plan.candidates} pins · {plan.alreadyAnswered} already priced recently · {plan.toPrice} to price
              </Text>
              <Text style={[styles.title, ink]}>
                This run: {plan.pinsThisRun} pins, up to {plan.plannedCredits} credits (≈ ${(plan.plannedCredits * USD_PER_CREDIT).toFixed(2)})
              </Text>
              {plan.toPrice > plan.pinsThisRun && (
                <Text style={[styles.body, muted]}>The ceiling stops it after {plan.pinsThisRun}; run again later for the rest.</Text>
              )}
              <Text style={[styles.body, muted]}>
                {plan.spendable === null ? 'The month’s budget is not a hard stop.' : `${plan.spendable} credits left this month.`}
              </Text>
            </View>
          )}

          {blockers.length > 0 && (
            <View style={styles.blockers} testID="price-pins-blockers">
              <Text style={[styles.body, { color: colors.destructive }]}>Can’t run yet:</Text>
              {blockers.map(b => <Text key={b} style={[styles.body, { color: colors.destructive }]}>• {b}</Text>)}
            </View>
          )}
          {error && setup && <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text>}

          {plan && blockers.length === 0 && (
            <Button
              label={`Price ${plan.pinsThisRun} pins`}
              subtitle={`Up to ${plan.plannedCredits} credits`}
              onPress={() => setConfirming(true)}
              loading={busy}
              disabled={busy || running}
            />
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        title={`Price ${plan?.pinsThisRun ?? 0} pins?`}
        message={`This spends up to ${plan?.plannedCredits ?? 0} Soldgraph credits and saves the prices to the live catalogue. You can stop it at any time.`}
        confirmLabel="Start pricing"
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </>
  );

  function Line({ label, value, ok }: { label: string; value: string; ok: boolean }) {
    return (
      <View style={styles.line}>
        <Text style={[styles.body, muted]}>{label}</Text>
        <Text style={[styles.body, { color: ok ? colors.homeInk : colors.destructive, fontFamily: 'Inter_600SemiBold' }]}>{value}</Text>
      </View>
    );
  }
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  kicker: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, fontSize: 15, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 110, paddingTop: 10, textAlignVertical: 'top' },
  plan: { borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  blockers: { gap: 2 },
});
