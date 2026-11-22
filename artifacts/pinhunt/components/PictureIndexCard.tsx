/**
 * Admin — the board-scan picture index (API: /admin/board-scans-picture-index).
 *
 * Building it describes every Pin & Pop reference picture once, in the
 * background on the server, so board scanning can also find pins by how they
 * look. Shows progress and lets an admin start, continue or stop it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { API_BASE } from '@/lib/apiBase';
import { localeFor } from '@/utils/format';

interface IndexInfo {
  configured: boolean;
  ratePerMinute: number;
  status: { referencesTotal: number; indexed: number; failed: number } | null;
  statusError: string | null;
  run: { running: boolean; done: number; failed: number; lastError: string | null; stopReason: 'finished' | 'stopped' | 'error' | null };
}

const n = (v: number) => v.toLocaleString(localeFor());

export default function PictureIndexCard({ token }: { token: string | undefined }) {
  const colors = useColors();
  const [info, setInfo] = useState<IndexInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // One check at a time: a slow answer is never overlapped by the next one.
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (!token || loading.current) return;
    loading.current = true;
    try {
      const res = await fetch(`${API_BASE}/admin/board-scans-picture-index`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) { setInfo(null); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load the picture index.');
      // A server without the picture index (older version) answers differently: show nothing.
      setInfo(data && typeof data.configured === 'boolean' && data.run ? (data as IndexInfo) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the picture index.');
    } finally {
      loading.current = false;
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Follow a build while it runs (every 15 s: progress moves ~25 pictures in that time).
  useEffect(() => {
    if (!info?.run.running) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [info?.run.running, load]);

  const act = async (path: 'run' | 'stop', body?: object) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/board-scans-picture-index/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'That didn\'t work.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn\'t work.');
    } finally {
      setBusy(false);
    }
  };

  if (!info && !error) return null;
  const s = info?.status;
  const left = s ? Math.max(0, s.referencesTotal - s.indexed - s.failed) : 0;
  const hours = info && left > 0 ? Math.ceil(left / info.ratePerMinute / 60) : 0;
  const btn = (label: string, onPress: () => void, primary = false) => (
    <TouchableOpacity
      disabled={busy}
      onPress={onPress}
      style={[styles.btn, { borderColor: colors.homeCoral, backgroundColor: primary ? colors.homeCoral : 'transparent', opacity: busy ? 0.5 : 1 }]}
    >
      <Text style={[styles.btnText, { color: primary ? '#fff' : colors.homeCoral }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}>
      <Text style={[styles.title, { color: colors.homeInk }]}>Picture index</Text>
      <Text style={[styles.hint, { color: colors.homeMuted }]}>
        Lets matching find pins by how they look, not just by title. Built once from the Pin & Pop reference pictures (kept as
        numbers only — the pictures aren't stored).
      </Text>
      {info && !info.configured ? (
        <Text style={[styles.hint, { color: colors.homeMuted }]}>Off on this server (PICTURE_INDEX_ENABLED and Google credentials).</Text>
      ) : null}
      {info?.statusError ? <Text style={[styles.hint, { color: colors.destructive }]}>{info.statusError}</Text> : null}
      {s ? (
        <Text style={[styles.progress, { color: colors.homeInk }]}>
          {n(s.indexed)} of {n(s.referencesTotal)} pictures indexed{s.failed ? ` · ${n(s.failed)} failed` : ''}
          {left > 0 ? ` · ${n(left)} to go (about ${hours} h)` : ''}
        </Text>
      ) : null}
      {info?.run.running ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.homeCoral} />
          <Text style={[styles.hint, { color: colors.homeMuted }]}>Building… {n(info.run.done)} done this run. You can leave this page.</Text>
        </View>
      ) : info?.run.stopReason === 'error' && info.run.lastError ? (
        <Text style={[styles.hint, { color: colors.destructive }]}>Stopped: {info.run.lastError}</Text>
      ) : null}
      {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
      {info?.configured && s ? (
        <View style={styles.row}>
          {info.run.running
            ? btn('Stop', () => act('stop'))
            : left > 0
              ? btn(s.indexed > 0 ? 'Continue building' : 'Build picture index', () => act('run'), true)
              : null}
          {!info.run.running && s.failed > 0 ? btn('Retry failed', () => act('run', { retryFailed: true })) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 14, gap: 8 },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, flexShrink: 1 },
  progress: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
