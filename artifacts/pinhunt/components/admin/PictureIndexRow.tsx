/**
 * Admin home: the picture index at a glance (board-scan and bulk-matcher
 * look-alikes, migration 085). Shows how much of the catalogue's reference
 * pictures are indexed, whether a build is running, and whether it tops up by
 * itself (PICTURE_INDEX_AUTO_RESUME). "Continue building" starts a build
 * here; tapping the row opens the full card on Board Scans.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { API_BASE } from '@/lib/apiBase';
import { radius, spacing } from '@/constants/theme';
import { localeFor } from '@/utils/format';

export interface PictureIndexData {
  configured: boolean;
  autoResume?: boolean;
  status: { referencesTotal: number; indexed: number; failed: number } | null;
  statusError?: string | null;
  run?: { running: boolean; done: number; failed: number; lastError: string | null; stopReason: string | null } | null;
}

export type PictureIndexView =
  | { kind: 'off'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'ok'; text: string; detail: string; complete: boolean; running: boolean; canBuild: boolean };

const n = (x: number) => x.toLocaleString(localeFor());

/** What the row says, from the server's picture-index status (null: board scanning is off on this server). */
export function pictureIndexView(data: PictureIndexData | null): PictureIndexView {
  if (!data) return { kind: 'off', text: 'Board scanning is off on this server.' };
  if (!data.configured) return { kind: 'off', text: 'Off on this server (PICTURE_INDEX_ENABLED and Google credentials).' };
  if (data.statusError || !data.status) return { kind: 'error', text: data.statusError ?? 'Could not read the picture index.' };
  const { referencesTotal, indexed, failed } = data.status;
  const left = Math.max(0, referencesTotal - indexed - failed);
  const running = !!data.run?.running;
  const complete = left === 0;
  const parts = [
    running ? `Building… ${n(data.run!.done)} this run` : complete ? 'Up to date' : `${n(left)} to add`,
    failed ? `${n(failed)} failed` : null,
    data.autoResume ? 'Tops up daily by itself' : 'Not automatic',
  ].filter(Boolean);
  return {
    kind: 'ok',
    text: `${n(indexed)} of ${n(referencesTotal)} pictures indexed`,
    detail: parts.join(' · '),
    complete,
    running,
    canBuild: !running && !complete,
  };
}

export function PictureIndexRow({ token }: { token?: string }) {
  const colors = useColors();
  const router = useRouter();
  const [data, setData] = useState<PictureIndexData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(`${API_BASE}/admin/board-scans-picture-index${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await call('');
      if (res.status === 404) { setData(null); setError(null); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Could not read the picture index.'); return; }
      setData(body as PictureIndexData);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    }
  }, [call, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const build = async () => {
    setBusy(true);
    try {
      const res = await call('/run', { method: 'POST', body: '{}' });
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not start the build.');
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const view = data === undefined ? null : pictureIndexView(data);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.homeMuted }]}>PICTURE INDEX</Text>
      <TouchableOpacity
        onPress={() => router.push('/admin/board-scans' as Href)}
        activeOpacity={0.85}
        accessibilityLabel="Picture index: open Board Scans"
        style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
      >
        <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
          <Feather name="image" size={16} color={colors.homeCoralDeep} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {error ? (
            <Text style={[styles.detail, { color: colors.destructive }]}>{error}</Text>
          ) : !view ? (
            <ActivityIndicator color={colors.homeCoral} style={{ alignSelf: 'flex-start' }} />
          ) : view.kind === 'ok' ? (
            <>
              <Text style={[styles.title, { color: colors.homeInk }]}>{view.text}</Text>
              <Text style={[styles.detail, { color: colors.homeMuted }]}>{view.detail}</Text>
            </>
          ) : (
            <Text style={[styles.detail, { color: view.kind === 'error' ? colors.destructive : colors.homeMuted }]}>{view.text}</Text>
          )}
        </View>
        {view?.kind === 'ok' && view.canBuild ? (
          <TouchableOpacity
            onPress={build}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.button, { borderColor: colors.homeCoral, opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={[styles.buttonLabel, { color: colors.homeCoral }]}>{busy ? 'Starting…' : 'Continue building'}</Text>
          </TouchableOpacity>
        ) : (
          <Feather name="chevron-right" size={16} color={colors.homeMuted} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section:      { gap: spacing.sm },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  card:         { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderRadius: radius.md },
  icon:         { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 15, fontFamily: 'Inter_500Medium' },
  detail:       { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  button:       { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  buttonLabel:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
