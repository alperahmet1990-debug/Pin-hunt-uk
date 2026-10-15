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
  MAX_SET_BATCH,
  STATUS_FILTERS,
  candidateTitle,
  confidenceTone,
  describeSetDecision,
  evidenceByField,
  formatValue,
  groupBySet,
  needsStructureChoice,
  pageCheckNote,
  pageLabel,
  pinsMissingStructure,
  safeExternalUrl,
  setRoute,
  SEPARATE_PINS_NOTE,
  type CandidateStatus,
  type ResearchCandidate,
  type ResearchEvidence,
  type ResearchPage,
  type StructureChoice,
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

  // Set view: one source page checked against many pins. Pins always start unticked.
  const [setKey, setSetKey] = useState<string | null>(null);
  const [setEvidence, setSetEvidence] = useState<ResearchEvidence[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);
  const [setFields, setSetFields] = useState<string[]>([]);
  const [setUrl, setSetUrl] = useState('');
  const [setNote, setSetNote] = useState('');
  const [setMsg, setSetMsg] = useState<string | null>(null);
  const [confirmSet, setConfirmSet] = useState(false);

  // Page view: one source page, with its pins from every set. Pins always start unticked.
  const [tab, setTab] = useState<'sets' | 'pages'>('sets');
  const [pages, setPages] = useState<ResearchPage[]>([]);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [pageCands, setPageCands] = useState<ResearchCandidate[]>([]);
  const [pageTicked, setPageTicked] = useState<string[]>([]);
  const [pageFields, setPageFields] = useState<string[]>([]);
  const [pageNote, setPageNote] = useState('');
  const [structure, setStructure] = useState<Record<string, StructureChoice | undefined>>({});
  const [pageMsg, setPageMsg] = useState<string | null>(null);

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

  const groups = groupBySet(candidates);

  // ── Set view ──
  const openSet = async (key: string) => {
    setSetKey(key);
    setTicked([]);
    setSetFields([]);
    setSetUrl('');
    setSetNote('');
    setSetMsg(null);
    setSetEvidence([]);
    try {
      // Show what the research cited for the set itself, so the reviewer can open it.
      const q = new URLSearchParams({ entity: 'set', ...(runId ? { runId } : {}) });
      const sets = await api(`/admin/research/candidates?${q.toString()}`);
      const setCand = (sets.candidates as ResearchCandidate[] | undefined)?.find(c => c.research_key === key);
      if (setCand) {
        const d = (await api(`/admin/research/candidates/${setCand.id}`)) as Detail;
        setSetEvidence(d.evidence.filter(e => safeExternalUrl(e.source_url)));
      }
    } catch {
      // The checklist works without the suggested sources.
    }
  };

  const setItems = groups.find(g => g.setKey === setKey)?.items ?? [];
  const setScopeRunId = setItems[0]?.run_id ?? runId;
  const titleOf = (id: string) => { const c = setItems.find(x => x.id === id); return c ? candidateTitle(c) : 'A pin'; };
  const toggleTick = (id: string) => setTicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleSetField = (f: string) => setSetFields(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));

  const recordSetCheck = async () => {
    if (!setKey || !setScopeRunId) return;
    setBusy(true);
    try {
      const data = await api(setRoute(setScopeRunId, setKey, 'direct-check'), {
        method: 'POST',
        body: JSON.stringify({
          source_url: setUrl.trim(), note: setNote.trim() || null,
          confirmed: ticked.map(candidateId => ({ candidateId, fields: setFields })),
        }),
      });
      const skipped = (data.skipped ?? []).length;
      setSetMsg(`Direct check recorded for ${data.results?.length ?? 0} pin${data.results?.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} could not be changed.` : ''}`);
      await loadCandidates(true);
    } catch (e) {
      setSetMsg(e instanceof Error ? e.message : 'Could not record the check');
    } finally {
      setBusy(false);
    }
  };

  const approveSet = async () => {
    if (!setKey || !setScopeRunId) return;
    setConfirmSet(false);
    setBusy(true);
    try {
      const data = await api(setRoute(setScopeRunId, setKey, 'decision'), {
        method: 'POST', body: JSON.stringify({ candidateIds: ticked, notes: setNote.trim() || null }),
      });
      setSetMsg(describeSetDecision(data, titleOf));
      setTicked([]);
      await loadCandidates(true);
    } catch (e) {
      setSetMsg(e instanceof Error ? e.message : 'Could not save the decision');
    } finally {
      setBusy(false);
    }
  };

  // ── Page view ──
  const loadPages = useCallback(async () => {
    if (!token || !runId) return;
    try {
      setPagesError(null);
      const data = await api(`/admin/research/pages?${new URLSearchParams({ runId }).toString()}`);
      setPages(data.pages ?? []);
    } catch (e) {
      setPagesError(e instanceof Error ? e.message : 'Could not load pages');
    }
  }, [api, runId, token]);

  useEffect(() => { if (tab === 'pages') loadPages(); }, [tab, loadPages]);

  const openPage = async (url: string) => {
    setPageUrl(url);
    setPageCands([]);
    setPageTicked([]);
    setPageFields([]);
    setPageNote('');
    setStructure({});
    setPageMsg(null);
    openSource(url);
    try {
      const q = new URLSearchParams({ runId: runId ?? '', url });
      const data = await api(`/admin/research/pages/candidates?${q.toString()}`);
      setPageCands(data.candidates ?? []);
    } catch (e) {
      setPageMsg(e instanceof Error ? e.message : 'Could not load the pins on this page');
    }
  };

  const pageGroups = groupBySet(pageCands);
  const missingStructure = pinsMissingStructure(pageCands, pageTicked, structure);
  const togglePageTick = (id: string) => setPageTicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const togglePageField = (f: string) => setPageFields(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));

  const recordPage = async () => {
    if (!pageUrl || !runId) return;
    setBusy(true);
    const lines: string[] = [];
    try {
      const sepIds = pageTicked.filter(id => structure[id] === 'separate_pins');
      const checkIds = pageTicked.filter(id => structure[id] !== 'separate_pins');
      const titleFor = (id: string) => { const c = pageCands.find(x => x.id === id); return c ? candidateTitle(c) : 'A pin'; };
      // "Separate pins": no check; send the pin back for more research with the note.
      for (const id of sepIds) {
        try {
          await api(`/admin/research/candidates/${id}/decision`, {
            method: 'POST', body: JSON.stringify({ decision: 'needs_more_research', notes: SEPARATE_PINS_NOTE }),
          });
          lines.push(`• ${titleFor(id)}: sent back for more research (separate pins)`);
        } catch (e) {
          lines.push(`• ${titleFor(id)}: ${e instanceof Error ? e.message : 'could not be changed'}`);
        }
      }
      // One direct-check call per set, with only that set's ticked pins.
      for (const g of pageGroups) {
        const ids = g.items.map(c => c.id).filter(id => checkIds.includes(id));
        if (ids.length === 0) continue;
        const ones = ids.filter(id => { const c = pageCands.find(x => x.id === id); return c && needsStructureChoice(c); }).length;
        try {
          const data = await api(setRoute(runId, g.setKey, 'direct-check'), {
            method: 'POST',
            body: JSON.stringify({
              source_url: pageUrl, note: pageCheckNote(pageNote, ones),
              confirmed: ids.map(candidateId => ({ candidateId, fields: pageFields })),
            }),
          });
          for (const r of data.results ?? []) lines.push(`• ${titleFor(r.candidateId)}: check recorded`);
          for (const k of data.skipped ?? []) lines.push(`• ${titleFor(k.candidateId)}: skipped. ${k.reason}`);
        } catch (e) {
          lines.push(`• ${g.setKey}: ${e instanceof Error ? e.message : 'could not record the check'}`);
        }
      }
      setPageMsg(lines.join('\n'));
      setPageTicked([]);
      await loadPages();
      const q = new URLSearchParams({ runId, url: pageUrl });
      const fresh = await api(`/admin/research/pages/candidates?${q.toString()}`);
      setPageCands(fresh.candidates ?? []);
      await loadCandidates(true);
    } catch (e) {
      setPageMsg([...lines, e instanceof Error ? e.message : 'Could not refresh'].join('\n'));
    } finally {
      setBusy(false);
    }
  };

  const openSource = (url: string | null) => {
    const safe = safeExternalUrl(url);
    if (safe) Linking.openURL(safe);
  };

  const s = styles(colors);

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
          options={[
            { value: 'sets' as const, label: 'By set', tone: 'teal' as const },
            { value: 'pages' as const, label: 'By page', tone: 'teal' as const },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'pages' ? (
          pagesError ? <Text style={s.error}>{pagesError}</Text>
          : pages.length === 0 ? <Text style={s.muted}>No source pages in this run.</Text>
          : pages.map(pg => (
            <TouchableOpacity
              key={pg.source_url}
              style={[s.card, s.row, { borderTopWidth: 0 }]}
              onPress={() => openPage(pg.source_url)}
              accessibilityRole="button"
              accessibilityLabel={`Open page ${pageLabel(pg.source_url)}`}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.rowTitle}>{pageLabel(pg.source_url)}</Text>
                <View style={s.chips}>
                  <Chip label={pg.source_class ?? 'unclassified'} tone={pg.source_class === 'official' ? 'owned' : 'neutral'} size="sm" />
                  <Chip label={`${pg.pin_count} pin${pg.pin_count === 1 ? '' : 's'}`} tone="teal" size="sm" />
                  <Chip label={`${pg.unchecked_count} unchecked`} tone="sand" size="sm" />
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.homeMuted} />
            </TouchableOpacity>
          ))
        ) : (<>
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
              <View style={s.headerRow}>
                <Text style={[s.setTitle, { flex: 1 }]}>{g.setKey}</Text>
                {g.setKey !== '(no set)' && (
                  <Button label="Review set" size="compact" variant="secondary" onPress={() => openSet(g.setKey)} />
                )}
              </View>
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
        </>)}
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

      {/* Set view: one source beside a checklist of the set's pins */}
      <Modal visible={!!setKey} animationType="slide" onRequestClose={() => setSetKey(null)}>
        <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.lg }}>
          <View style={s.headerRow}>
            <Text style={[s.title, { flex: 1 }]}>{setKey}</Text>
            <Button label="Close" variant="text" onPress={() => setSetKey(null)} />
          </View>
          <View style={s.card}>
            <Text style={s.setTitle}>Set source</Text>
            <Text style={s.body}>
              Open the page, then tick only the pins it shows. It must be an official page or one already cited for this set.
            </Text>
            {setEvidence.map(e => (
              <View key={e.id} style={s.evidence}>
                <Text style={s.muted}>{e.publisher ?? 'unknown'} · {e.source_class} · {e.field}</Text>
                <View style={s.chips}>
                  <Button label="Open source" size="compact" variant="text" icon="external-link" onPress={() => openSource(e.source_url)} />
                  <Button label="Use as set source" size="compact" variant="text" onPress={() => setSetUrl(e.source_url ?? '')} />
                </View>
              </View>
            ))}
            <TextInput style={s.input} value={setUrl} onChangeText={setSetUrl} placeholder="https:// link of the page you opened"
              placeholderTextColor={colors.homeMuted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Set source link" />
          </View>

          <View style={s.card}>
            <Text style={s.setTitle}>Pins in this list ({ticked.length} ticked, max {MAX_SET_BATCH})</Text>
            {setItems.length === 0 && <Text style={s.muted}>No pins in this list.</Text>}
            {setItems.map(c => {
              const on = ticked.includes(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={s.row}
                  onPress={() => toggleTick(c.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Tick ${candidateTitle(c)}`}
                >
                  <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.homeInk : colors.homeMuted} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.rowTitle}>{candidateTitle(c)}</Text>
                    <View style={s.chips}>
                      <Chip label={c.status.replace(/_/g, ' ')} tone="teal" size="sm" />
                      <Chip label={c.record_confidence} tone={confidenceTone(c.record_confidence)} size="sm" />
                      {c.duplicate_status.startsWith('DUPLICATE') || c.duplicate_status.startsWith('PROBABLE')
                        ? <Chip label="Already in catalogue" tone="sand" size="sm" /> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.card}>
            <Text style={s.setTitle}>What the page confirms</Text>
            <View style={s.chips}>
              {CHECKABLE_FIELDS.map(f => {
                const on = setFields.includes(f.field);
                return (
                  <TouchableOpacity
                    key={f.field}
                    onPress={() => toggleSetField(f.field)}
                    style={[s.toggle, on && { backgroundColor: colors.homeTealSoft, borderColor: colors.homeInk }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={s.v}>{on ? '✓ ' : ''}{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput style={[s.input, { minHeight: 64 }]} value={setNote} onChangeText={setSetNote} multiline maxLength={240}
              placeholder="Note (optional, 240 characters)" placeholderTextColor={colors.homeMuted} accessibilityLabel="Set note" />
            <Button label="Record set check" icon="check" loading={busy}
              disabled={ticked.length === 0 || setFields.length === 0 || !setUrl.trim()} onPress={recordSetCheck} />
            <Button label="Approve ticked pins" icon="check-circle" variant="secondary"
              disabled={ticked.length === 0 || busy} onPress={() => setConfirmSet(true)} />
            <Text style={s.muted}>
              Approval only goes through for checked pins that pass the usual rules; the rest stay pending and are listed here.
            </Text>
            {setMsg && <Text style={s.notice}>{setMsg}</Text>}
          </View>
        </ScrollView>
        <ConfirmDialog
          visible={confirmSet}
          title={`Approve ${ticked.length} ticked pin${ticked.length === 1 ? '' : 's'}?`}
          message="This records your decision only. The catalogue is not changed until a separate import. Pins that fail the usual checks stay pending."
          confirmLabel="Approve"
          onConfirm={approveSet}
          onCancel={() => setConfirmSet(false)}
        />
      </Modal>

      {/* Page view: one source page beside its pins from every set */}
      <Modal visible={!!pageUrl} animationType="slide" onRequestClose={() => setPageUrl(null)}>
        <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.lg }}>
          <View style={s.headerRow}>
            <Text style={[s.title, { flex: 1 }]}>{pageUrl ? pageLabel(pageUrl) : ''}</Text>
            <Button label="Close" variant="text" onPress={() => setPageUrl(null)} />
          </View>
          <View style={s.card}>
            <Text style={s.setTitle}>Page</Text>
            <Text style={s.body}>Read the page, then tick only the pins it shows. Pins start unticked.</Text>
            <Button label="Open page" size="compact" variant="text" icon="external-link" onPress={() => openSource(pageUrl)} />
          </View>
          {pageGroups.map(g => (
            <View key={g.setKey} style={s.card}>
              <Text style={s.setTitle}>{g.setKey}</Text>
              {g.items.map(c => {
                const on = pageTicked.includes(c.id);
                const needsChoice = needsStructureChoice(c);
                const choice = structure[c.id];
                return (
                  <View key={c.id} style={{ gap: spacing.sm }}>
                    <TouchableOpacity
                      style={s.row}
                      onPress={() => togglePageTick(c.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Tick ${candidateTitle(c)}`}
                    >
                      <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.homeInk : colors.homeMuted} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={s.rowTitle}>{candidateTitle(c)}</Text>
                        <View style={s.chips}>
                          <Chip label={c.status.replace(/_/g, ' ')} tone="teal" size="sm" />
                          <Chip label={c.record_confidence} tone={confidenceTone(c.record_confidence)} size="sm" />
                        </View>
                      </View>
                    </TouchableOpacity>
                    {needsChoice && (
                      <View style={s.chips}>
                        {([['one_pin', 'One pin showing all of these'], ['separate_pins', 'Separate pins']] as const).map(([val, label]) => (
                          <TouchableOpacity
                            key={val}
                            onPress={() => setStructure(prev => ({ ...prev, [c.id]: val }))}
                            style={[s.toggle, choice === val && { backgroundColor: colors.homeTealSoft, borderColor: colors.homeInk }]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: choice === val }}
                            accessibilityLabel={`${label}: ${candidateTitle(c)}`}
                          >
                            <Text style={s.v}>{choice === val ? '✓ ' : ''}{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
          <View style={s.card}>
            <Text style={s.setTitle}>What the page confirms ({pageTicked.length} ticked)</Text>
            <View style={s.chips}>
              {CHECKABLE_FIELDS.map(f => {
                const on = pageFields.includes(f.field);
                return (
                  <TouchableOpacity
                    key={f.field}
                    onPress={() => togglePageField(f.field)}
                    style={[s.toggle, on && { backgroundColor: colors.homeTealSoft, borderColor: colors.homeInk }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={s.v}>{on ? '✓ ' : ''}{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput style={[s.input, { minHeight: 64 }]} value={pageNote} onChangeText={setPageNote} multiline maxLength={200}
              placeholder="Note (optional)" placeholderTextColor={colors.homeMuted} accessibilityLabel="Page note" />
            {missingStructure.length > 0 && (
              <Text style={s.error}>Choose one pin or separate pins for: {missingStructure.map(candidateTitle).join(', ')}</Text>
            )}
            <Button label="Record page check" icon="check" loading={busy}
              disabled={pageTicked.length === 0 || missingStructure.length > 0
                || (pageTicked.some(id => structure[id] !== 'separate_pins') && pageFields.length === 0)}
              onPress={recordPage} />
            {pageMsg && <Text style={s.notice}>{pageMsg}</Text>}
          </View>
        </ScrollView>
      </Modal>

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
                      style={[s.toggle, on && { backgroundColor: colors.homeTealSoft, borderColor: colors.homeInk }]}
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
