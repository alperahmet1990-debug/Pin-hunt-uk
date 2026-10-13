/**
 * Admin — Research Review (App Creator only).
 *
 * Public-source catalogue research waits here in staging (migration 045).
 * A reviewer opens a source, records what it confirms, and decides.
 * Nothing on this screen writes to the catalogue: approving records a
 * decision, and importing approved pins is a separate, later step.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { Button, Chip, ConfirmDialog, SegmentedControl } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import {
  CHECKABLE_FIELDS,
  STATUS_FILTERS,
  candidateTitle,
  confidenceTone,
  evidenceByField,
  formatValue,
  groupBySet,
  safeExternalUrl,
  type CandidateStatus,
  type ResearchCandidate,
  type ResearchEvidence,
} from '@/utils/researchReview';

interface Run { id: string; git_commit: string; loaded_at: string; summary: { pins?: number; engineVerified?: number } }
interface PreviewCounts { pins: number; sets: number; evidence: number; engineVerified: number; needsReview: number; duplicates: number }
interface Detail { candidate: ResearchCandidate; evidence: ResearchEvidence[]; duplicatePin: Record<string, unknown> | null }
type Decision = 'approve' | 'reject' | 'needs_more_research';

export default function ResearchReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const headers = useCallback(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<CandidateStatus>('needs_direct_verification');
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingRun, setPendingRun] = useState<{ payload: unknown; counts: PreviewCounts } | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [checkFields, setCheckFields] = useState<string[]>([]);
  const [checkUrl, setCheckUrl] = useState('');
  const [checkNote, setCheckNote] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Decision | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const resp = await fetch(`${API_BASE}${path}`, { ...init, headers: headers() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const errs = Array.isArray(data.errors) ? `\n${data.errors.slice(0, 5).join('\n')}` : '';
      throw new Error(`${data.error ?? 'Request failed'}${errs}`);
    }
    return data;
  }, [headers]);

  const loadRuns = useCallback(async () => {
    const data = await api('/admin/research/runs');
    setRuns(data.runs ?? []);
    setRunId(prev => prev ?? data.runs?.[0]?.id ?? null);
  }, [api]);

  const loadCandidates = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      await loadRuns();
      const q = new URLSearchParams({ status, entity: 'pin', ...(runId ? { runId } : {}) });
      const data = await api(`/admin/research/candidates?${q.toString()}`);
      setCandidates(data.candidates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load research');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, loadRuns, runId, status, token]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // ── Load a research run (engine out/staging_payload.json) ──
  const pickRun = async () => {
    try {
      setActionMsg(null);
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: File };
      const text = Platform.OS === 'web' && asset.file
        ? await asset.file.text()
        : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const payload = JSON.parse(text);
      const data = await api('/admin/research/runs/preview', { method: 'POST', body: JSON.stringify({ run: payload }) });
      setPendingRun({ payload, counts: data.counts });
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const loadRun = async () => {
    if (!pendingRun) return;
    setLoadingRun(true);
    try {
      const data = await api('/admin/research/runs', { method: 'POST', body: JSON.stringify({ run: pendingRun.payload }) });
      setPendingRun(null);
      setRunId(data.runId);
      setActionMsg('Run loaded into staging. Nothing was added to the catalogue.');
      await loadCandidates();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoadingRun(false);
    }
  };

  // ── Candidate detail ──
  const openCandidate = async (id: string) => {
    try {
      setActionMsg(null);
      const data = (await api(`/admin/research/candidates/${id}`)) as Detail;
      setDetail(data);
      setCheckFields([]);
      setCheckUrl('');
      setCheckNote('');
      setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open candidate');
    }
  };

  const recordCheck = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/admin/research/candidates/${detail.candidate.id}/direct-check`, {
        method: 'POST', body: JSON.stringify({ fields: checkFields, sourceUrl: checkUrl.trim(), note: checkNote.trim() || null }),
      });
      setActionMsg('Direct check recorded.');
      await openCandidate(detail.candidate.id);
      await loadCandidates(true);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not record the check');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: Decision) => {
    if (!detail) return;
    setConfirm(null);
    setBusy(true);
    try {
      await api(`/admin/research/candidates/${detail.candidate.id}/decision`, {
        method: 'POST', body: JSON.stringify({ decision, notes: notes.trim() || null }),
      });
      setActionMsg(decision === 'approve' ? 'Approved. It will be imported only in the separate import step.' : 'Decision saved.');
      setDetail(null);
      await loadCandidates(true);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not save the decision');
    } finally {
      setBusy(false);
    }
  };

  const openSource = (url: string | null) => {
    const safe = safeExternalUrl(url);
    if (safe) Linking.openURL(safe);
  };

  const s = styles(colors);
  const groups = groupBySet(candidates);

  return (
    <View style={[s.root, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Research Review' }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 32, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCandidates(true)} />}
      >
        <View style={s.card}>
          <Text style={s.title}>Public-source research</Text>
          <Text style={s.body}>
            Pins found by catalogue research wait here. Nothing on this screen changes the catalogue: open a source,
            record what it confirms, then decide. Importing approved pins is a separate step.
          </Text>
          <Button label="Load research run (JSON)" icon="upload" variant="secondary" onPress={pickRun} />
          {runs.length > 0 && (
            <Text style={s.muted}>
              Latest run {runs[0].git_commit} · {runs[0].summary?.pins ?? 0} pins · {runs[0].summary?.engineVerified ?? 0} engine-verified
            </Text>
          )}
          {actionMsg && !detail && <Text style={s.notice}>{actionMsg}</Text>}
        </View>

        <SegmentedControl
          options={STATUS_FILTERS.map(f => ({ value: f.value, label: f.label, tone: 'teal' as const }))}
          value={status}
          onChange={v => setStatus(v)}
        />

        {loading ? (
          <ActivityIndicator color={colors.homeCoral} />
        ) : error ? (
          <Text style={s.error}>{error}</Text>
        ) : groups.length === 0 ? (
          <Text style={s.muted}>No pins in this list.</Text>
        ) : (
          groups.map(g => (
            <View key={g.setKey} style={s.card}>
              <Text style={s.setTitle}>{g.setKey}</Text>
              {g.items.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={s.row}
                  onPress={() => openCandidate(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${candidateTitle(c)}`}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.rowTitle}>{candidateTitle(c)}</Text>
                    <View style={s.chips}>
                      <Chip label={c.record_confidence} tone={confidenceTone(c.record_confidence)} size="sm" />
                      {c.duplicate_status.startsWith('DUPLICATE') || c.duplicate_status.startsWith('PROBABLE')
                        ? <Chip label="Already in catalogue" tone="sand" size="sm" /> : null}
                      {c.warnings.length > 0 ? <Chip label={`${c.warnings.length} variant${c.warnings.length > 1 ? 's' : ''}`} tone="neutral" size="sm" /> : null}
                      {c.review_reasons.some(r => r.startsWith('conflict:')) ? <Chip label="Conflict" tone="coralDeep" size="sm" /> : null}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.homeMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Preview of a run before loading it */}
      <ConfirmDialog
        visible={!!pendingRun}
        title="Load this run into staging?"
        message={pendingRun ? `${pendingRun.counts.pins} pins and ${pendingRun.counts.sets} sets with ${pendingRun.counts.evidence} evidence rows. `
          + `${pendingRun.counts.engineVerified} engine-verified, ${pendingRun.counts.duplicates} already in the catalogue. The catalogue itself is not changed.` : undefined}
        confirmLabel={loadingRun ? 'Loading…' : 'Load run'}
        onConfirm={loadRun}
        onCancel={() => setPendingRun(null)}
      />

      {/* Candidate detail */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        {detail && (
          <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.lg }}>
            <View style={s.headerRow}>
              <Text style={[s.title, { flex: 1 }]}>{candidateTitle(detail.candidate)}</Text>
              <Button label="Close" variant="text" onPress={() => setDetail(null)} />
            </View>
            <View style={s.chips}>
              <Chip label={`Identity: ${detail.candidate.record_confidence}`} tone={confidenceTone(detail.candidate.record_confidence)} />
              <Chip label={detail.candidate.status.replace(/_/g, ' ')} tone="teal" />
            </View>
            {detail.candidate.review_reasons.length > 0 && <Text style={s.error}>{detail.candidate.review_reasons.join(' · ')}</Text>}
            {detail.candidate.warnings.length > 0 && <Text style={s.muted}>{detail.candidate.warnings.join(' · ')}</Text>}

            <View style={s.card}>
              <Text style={s.setTitle}>Proposed record</Text>
              {Object.entries(detail.candidate.proposed).map(([k, v]) => (
                <View key={k} style={s.kv}>
                  <Text style={s.k}>{k}</Text>
                  <Text style={s.v}>{formatValue(v)}</Text>
                </View>
              ))}
            </View>

            {detail.duplicatePin && (
              <View style={s.card}>
                <Text style={s.setTitle}>Already in the catalogue</Text>
                <Text style={s.body}>
                  {formatValue(detail.duplicatePin.pinhunt_id)} · {formatValue(detail.duplicatePin.title)} · {formatValue(detail.duplicatePin.collection)}
                </Text>
                <Text style={s.muted}>Approving this means enriching that pin later, never replacing it.</Text>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.setTitle}>Evidence</Text>
              {evidenceByField(detail.evidence).map(g => (
                <View key={g.field} style={{ gap: 6 }}>
                  <Text style={s.k}>{g.field}</Text>
                  {g.items.map(e => (
                    <View key={e.id} style={s.evidence}>
                      <Text style={s.v}>{formatValue(e.value)}</Text>
                      <Text style={s.muted}>
                        {e.publisher ?? 'unknown'} · {e.source_class} · {e.method.replace(/_/g, ' ')}{e.note ? ` · ${e.note}` : ''}
                      </Text>
                      {safeExternalUrl(e.source_url) && (
                        <View style={s.chips}>
                          <Button label="Open source" size="compact" variant="text" icon="external-link" onPress={() => openSource(e.source_url)} />
                          <Button label="Use as checked source" size="compact" variant="text" onPress={() => setCheckUrl(e.source_url ?? '')} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>

            <View style={s.card}>
              <Text style={s.setTitle}>Direct check</Text>
              <Text style={s.body}>Open a source yourself, then tick only what that page confirms.</Text>
              <View style={s.chips}>
                {CHECKABLE_FIELDS.map(f => {
                  const on = checkFields.includes(f.field);
                  return (
                    <TouchableOpacity
                      key={f.field}
                      onPress={() => setCheckFields(prev => (on ? prev.filter(x => x !== f.field) : [...prev, f.field]))}
                      style={[s.toggle, on && { backgroundColor: colors.homeTealSoft, borderColor: colors.homeTeal }]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={s.v}>{on ? '✓ ' : ''}{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput style={s.input} value={checkUrl} onChangeText={setCheckUrl} placeholder="https:// link of the page you opened"
                placeholderTextColor={colors.homeMuted} autoCapitalize="none" autoCorrect={false} />
              <TextInput style={s.input} value={checkNote} onChangeText={setCheckNote} placeholder="Note (optional, 240 characters)"
                placeholderTextColor={colors.homeMuted} maxLength={240} />
              <Button label="Record direct check" icon="check" loading={busy}
                disabled={checkFields.length === 0 || !checkUrl.trim()} onPress={recordCheck} />
            </View>

            <View style={s.card}>
              <Text style={s.setTitle}>Decision</Text>
              <TextInput style={[s.input, { minHeight: 64 }]} value={notes} onChangeText={setNotes} multiline maxLength={2000}
                placeholder="Notes (needed for variants, rejections and more research)" placeholderTextColor={colors.homeMuted} />
              <Button label="Approve" icon="check-circle" loading={busy} onPress={() => setConfirm('approve')} />
              <Button label="Needs more research" variant="secondary" onPress={() => setConfirm('needs_more_research')} />
              <Button label="Reject" variant="destructive" onPress={() => setConfirm('reject')} />
              {actionMsg && <Text style={s.notice}>{actionMsg}</Text>}
            </View>
          </ScrollView>
        )}
        <ConfirmDialog
          visible={!!confirm}
          title={confirm === 'approve' ? 'Approve this pin?' : confirm === 'reject' ? 'Reject this pin?' : 'Send back for more research?'}
          message={confirm === 'approve' ? 'This records your decision only. The catalogue is not changed until a separate import.' : undefined}
          confirmLabel={confirm === 'approve' ? 'Approve' : confirm === 'reject' ? 'Reject' : 'Send back'}
          destructive={confirm === 'reject'}
          onConfirm={() => confirm && decide(confirm)}
          onCancel={() => setConfirm(null)}
        />
      </Modal>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  card: { backgroundColor: c.homeSurface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.homeLine, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: c.homeInk },
  setTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: c.homeInk },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', color: c.homeInk, lineHeight: 20 },
  muted: { fontSize: 13, fontFamily: 'Inter_400Regular', color: c.homeMuted },
  notice: { fontSize: 13, fontFamily: 'Inter_500Medium', color: c.homeTeal },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', color: c.homeCoralDeep },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.homeLine },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_500Medium', color: c.homeInk },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kv: { flexDirection: 'row', gap: spacing.sm },
  k: { width: 130, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: c.homeMuted },
  v: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: c.homeInk },
  evidence: { borderLeftWidth: 2, borderLeftColor: c.homeLine, paddingLeft: spacing.sm, gap: 2 },
  toggle: { borderWidth: 1, borderColor: c.homeLine, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: c.homeLine, borderRadius: radius.md, padding: spacing.md, fontSize: 14,
    fontFamily: 'Inter_400Regular', color: c.homeInk, backgroundColor: c.homeBackground },
});
