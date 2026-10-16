/**
 * Research Review → Catalogue tab: browse and decide on large research runs (historical backfill).
 *
 * Uses /api/admin/research/catalogue* (research-catalogue.ts). Decisions are the existing candidate
 * statuses; "Flag issue" is an attributed evidence row. Nothing is ticked on load, and "Validate"
 * still needs a direct check by a person (the API re-applies the per-pin rules on every batch).
 * "Research needed" decisions and flags are exported for the hourly research queue.
 * "Import my checks" uploads the reviewer's checked backfill workbook (My check column); the API records
 * the checks under the logged-in reviewer and lists the pins now ready, which are approved only after
 * the reviewer confirms "Approve".
 */
import React, { useCallback, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Modal, Platform, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button, Chip, SegmentedControl } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { candidateTitle, type ResearchCandidate } from '@/utils/researchReview';

type Api = (path: string, init?: RequestInit) => Promise<any>;
type Only = 'all' | 'flagged' | 'duplicates' | 'incomplete';
type Action = 'validate' | 'needs_more_research' | 'reject' | 'flag';

export interface BrowseRow extends ResearchCandidate {
  year: number | null; line: string; edition: string; flags: string[]; duplicate: boolean;
  set_expected: number | null; set_identified: number | null; decision_notes?: string | null;
}

export const BROWSE_PAGE = 50;
const LINES = ['wdw', 'dlr', 'dlp', 'dsuk', 'dsus', 'shdr', 'hkdl', 'tdr', 'lic', 'other'];
const EDITIONS = ['OE', 'LE', 'LR', 'other'];
const STATUSES: Array<[string, string]> = [
  ['needs_direct_verification', 'Needs check'], ['researched', 'Researched'], ['direct_verified', 'Checked'],
  ['needs_more_research', 'Research needed'], ['approved', 'Validated'], ['rejected', 'Rejected'],
];
const ACTION_LABEL: Record<Action, string> = {
  validate: 'Validate', needs_more_research: 'Research needed', reject: 'Reject', flag: 'Flag issue',
};

export interface ChecksResult {
  checks: number; matched: number; recorded: { ok: number; research_needed: number; flagged: number }; alreadyRecorded: number;
  unknownCount: number; unknown: string[]; unrecognised: string[];
  ready: Array<{ id: string; research_key: string }>; heldCount: number; held: Array<{ research_key: string; reason: string }>;
}

/** Most common reasons first, e.g. "12 × Identity confidence is too low to approve". */
export function heldSummary(held: ChecksResult['held']): string[] {
  const n = new Map<string, number>();
  for (const h of held) n.set(h.reason, (n.get(h.reason) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${c} × ${r}`);
}

async function pickWorkbookBase64(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'], copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: File };
  if (Platform.OS === 'web' && asset.file) {
    const bytes = new Uint8Array(await asset.file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** Query string for the browse endpoint; empty filters are left out. */
export function browseQuery(f: { runId: string | null; year: string; line: string; edition: string; status: string; only: Only; q: string; source: string; set: string }, offset: number) {
  const p = new URLSearchParams({ offset: String(offset), limit: String(BROWSE_PAGE) });
  if (f.runId) p.set('runId', f.runId);
  for (const k of ['year', 'line', 'edition', 'status', 'q', 'source', 'set'] as const) if (f[k]) p.set(k, f[k]);
  if (f.only !== 'all') p.set('only', f.only);
  return p.toString();
}

export default function CatalogueBrowser({ api, runId, onOpen }: { api: Api; runId: string | null; onOpen: (id: string) => void }) {
  const colors = useColors();
  const s = styles(colors);
  const [year, setYear] = useState('');
  const [line, setLine] = useState('');
  const [edition, setEdition] = useState('');
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState<Only>('all');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [set, setSet] = useState('');
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<string, Record<string, number>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [checks, setChecks] = useState<ChecksResult | null>(null);
  const [checksBusy, setChecksBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ action: Action; ids: string[] } | null>(null);
  const [note, setNote] = useState('');
  const [sets, setSets] = useState<Array<{ set_research_key: string; name: string; expected: number | null; identified: number; missing: number | null; possible_duplicates: number }> | null>(null);

  const filters = { runId, year, line, edition, status, only, q, source, set };
  const load = useCallback(async (offset = 0) => {
    try {
      setMsg(null);
      const data = await api(`/admin/research/catalogue?${browseQuery(filters, offset)}`);
      setRows(prev => (offset === 0 ? data.candidates : [...prev, ...data.candidates]));
      setTotal(data.total); setFacets(data.facets ?? {});
      if (offset === 0) setSelected([]);
    } catch (e) { setMsg((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, runId, year, line, edition, status, only, q, source, set]);
  useEffect(() => { load(0); }, [load]);

  const loadSets = async () => {
    try { setSets((await api(`/admin/research/catalogue/sets?only=incomplete${runId ? `&runId=${runId}` : ''}`)).sets); }
    catch (e) { setMsg((e as Error).message); }
  };

  const toggle = (id: string) => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));

  const run = async () => {
    if (!pending) return;
    const { action, ids } = pending;
    setBusy(true);
    try {
      if (action === 'flag') {
        for (const id of ids) await api(`/admin/research/candidates/${id}/flag`, { method: 'POST', body: JSON.stringify({ note }) });
        setMsg(`Flagged ${ids.length} pin${ids.length === 1 ? '' : 's'}.`);
      } else {
        const decision = action === 'validate' ? 'approve' : action;
        const data = await api('/admin/research/catalogue/decisions', {
          method: 'POST', body: JSON.stringify({ candidateIds: ids, decision, notes: note.trim() || null }),
        });
        const refused = (data.results as Array<{ ok: boolean; reason?: string }>).filter(r => !r.ok);
        setMsg(`${ACTION_LABEL[action]}: ${data.decided} saved${refused.length ? `, ${refused.length} not changed (${refused[0].reason})` : ''}.`);
      }
      setPending(null); setNote('');
      await load(0);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const exportResearchNeeded = async () => {
    try {
      const data = await api(`/admin/research/catalogue/research-needed${runId ? `?runId=${runId}` : ''}`);
      const text = JSON.stringify(data, null, 1);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = `research-needed-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      } else {
        await Share.share({ message: text, title: 'PinHunt research needed' });
      }
      setMsg(`Exported ${data.count} pin${data.count === 1 ? '' : 's'} for the research queue.`);
    } catch (e) { setMsg((e as Error).message); }
  };

  const importChecks = async () => {
    if (!runId) { setMsg('Choose a research run first.'); return; }
    try {
      const file = await pickWorkbookBase64();
      if (!file) return;
      setChecksBusy(true);
      setChecks(await api('/admin/research/catalogue/checks', { method: 'POST', body: JSON.stringify({ runId, file }) }));
      await load(0);
    } catch (e) { setMsg((e as Error).message); } finally { setChecksBusy(false); }
  };

  const approveReady = async () => {
    if (!checks) return;
    setChecksBusy(true);
    let decided = 0; const refused: string[] = [];
    try {
      for (let i = 0; i < checks.ready.length; i += 100) {
        const data = await api('/admin/research/catalogue/decisions', {
          method: 'POST',
          body: JSON.stringify({ candidateIds: checks.ready.slice(i, i + 100).map(r => r.id), decision: 'approve', notes: 'Approved after spreadsheet check' }),
        });
        decided += data.decided;
        for (const r of data.results as Array<{ ok: boolean; reason?: string }>) if (!r.ok && r.reason) refused.push(r.reason);
      }
      setMsg(`Validated ${decided} pin${decided === 1 ? '' : 's'} from your spreadsheet checks${refused.length ? `; ${refused.length} not changed (${refused[0]})` : ''}. Importing into the catalogue is a separate step.`);
      setChecks(null);
      await load(0);
    } catch (e) { setMsg((e as Error).message); } finally { setChecksBusy(false); }
  };

  const chipRow = (label: string, values: string[], value: string, set: (v: string) => void, counts?: Record<string, number>, names?: Record<string, string>) => (
    <View style={s.filterRow}>
      <Text style={s.filterLabel}>{label}</Text>
      <View style={s.chips}>
        {['', ...values].map(v => {
          const on = value === v;
          const n = v && counts ? counts[v] : undefined;
          if (v && counts && !n && !on) return null;
          return (
            <TouchableOpacity key={v || 'all'} onPress={() => set(v)} style={[s.pill, on && s.pillOn]}
              accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label} ${v || 'all'}`}>
              <Text style={[s.pillText, on && s.pillTextOn]}>{v ? `${names?.[v] ?? v}${n != null ? ` · ${n}` : ''}` : 'All'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const years = Object.keys(facets.year ?? {}).filter(y => y !== 'none').sort();
  const needsNote = pending && pending.action !== 'validate';

  return (
    <View style={{ gap: spacing.md }} testID="catalogue-browser">
      <View style={s.card}>
        <SegmentedControl
          options={[
            { value: 'all' as const, label: 'All pins', tone: 'teal' as const },
            { value: 'flagged' as const, label: 'Flagged', tone: 'teal' as const },
            { value: 'duplicates' as const, label: 'Possible duplicates', tone: 'teal' as const },
            { value: 'incomplete' as const, label: 'Incomplete sets', tone: 'teal' as const },
          ]}
          value={only}
          onChange={v => { setOnly(v); if (v === 'incomplete') loadSets(); }}
        />
        {chipRow('Year', years, year, setYear, facets.year)}
        {chipRow('Line', LINES, line, setLine, facets.line)}
        {chipRow('Edition', EDITIONS, edition, setEdition, facets.edition)}
        {chipRow('Status', STATUSES.map(x => x[0]), status, setStatus, facets.status, Object.fromEntries(STATUSES))}
        <View style={s.inputs}>
          <TextInput style={s.input} placeholder="Search name or key" value={q} onChangeText={setQ} accessibilityLabel="Search" />
          <TextInput style={s.input} placeholder="Source (e.g. wdwnt)" value={source} onChangeText={setSource} autoCapitalize="none" accessibilityLabel="Source" />
          {set ? <Button label={`Set: ${set.split('/').slice(-1)[0]} ✕`} variant="text" size="compact" onPress={() => setSet('')} /> : null}
        </View>
        <View style={s.headerRow}>
          <Text style={s.muted}>{total} pin{total === 1 ? '' : 's'} match</Text>
          <View style={{ flex: 1 }} />
          <Button label={checksBusy && !checks ? 'Reading…' : 'Import my checks'} variant="secondary" size="compact" icon="upload"
            loading={checksBusy && !checks} onPress={importChecks} />
          <Button label="Export research needed" variant="secondary" size="compact" icon="download" onPress={exportResearchNeeded} />
        </View>
        {msg && <Text style={s.notice} accessibilityLiveRegion="polite">{msg}</Text>}
      </View>

      {selected.length > 0 && (
        <View style={[s.card, s.batch]} testID="batch-bar">
          <Text style={s.rowTitle}>{`${selected.length} selected`}</Text>
          <View style={{ flex: 1 }} />
          {(['validate', 'needs_more_research', 'reject', 'flag'] as Action[]).map(a => (
            <Button key={a} label={ACTION_LABEL[a]} size="compact" variant={a === 'validate' ? 'primary' : a === 'reject' ? 'destructive' : 'secondary'}
              onPress={() => setPending({ action: a, ids: selected })} />
          ))}
        </View>
      )}

      {only === 'incomplete' && sets && (
        <View style={s.card}>
          <Text style={s.setTitle}>Incomplete sets ({sets.length})</Text>
          <Text style={s.muted}>Missing members are never invented; add them only when a source names them.</Text>
          {sets.slice(0, 50).map(st => (
            <TouchableOpacity key={st.set_research_key} style={s.row} onPress={() => { setSet(st.set_research_key); setOnly('all'); }}
              accessibilityRole="button" accessibilityLabel={`Show set ${st.name}`}>
              <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>{st.name}</Text>
              <Chip label={`${st.identified} of ${st.expected}`} tone="teal" size="sm" />
              <Chip label={`${st.missing} missing`} tone="sand" size="sm" />
              {st.possible_duplicates > 0 && <Chip label={`${st.possible_duplicates} possible dup.`} tone="coral" size="sm" />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.card}>
        {rows.length === 0 ? <Text style={s.muted}>No pins match these filters.</Text> : rows.map(r => {
          const on = selected.includes(r.id);
          return (
            <View key={r.id} style={[s.row, on && s.rowSelected]} testID={`browse-row-${r.id}`}>
              <TouchableOpacity onPress={() => toggle(r.id)} style={s.tick} accessibilityRole="checkbox"
                accessibilityState={{ checked: on }} accessibilityLabel={`Select ${candidateTitle(r)}`}>
                <Feather name={on ? 'check-square' : 'square'} size={22} color={colors.homeInk} />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, gap: 4 }} onPress={() => onOpen(r.id)} accessibilityRole="button" accessibilityLabel={`Open ${candidateTitle(r)}`}>
                <Text style={s.rowTitle} numberOfLines={2}>{candidateTitle(r)}</Text>
                <View style={s.chips}>
                  <Chip label={`${r.year ?? '?'} · ${r.line.toUpperCase()} · ${r.edition}`} tone="neutral" size="sm" />
                  <Chip label={STATUSES.find(x => x[0] === r.status)?.[1] ?? r.status} tone="teal" size="sm" />
                  <Chip label={r.record_confidence} tone="neutral" size="sm" variant="outline" />
                  {r.duplicate && <Chip label="Possible duplicate" tone="coral" size="sm" />}
                  {r.flags.length > 0 && <Chip label={`Flagged: ${r.flags[0]}`} tone="sand" size="sm" />}
                  {r.set_expected != null && (r.set_identified ?? 0) < r.set_expected && <Chip label={`Set ${r.set_identified}/${r.set_expected}`} tone="sand" size="sm" variant="outline" />}
                </View>
              </TouchableOpacity>
              <View style={s.rowActions}>
                {(['validate', 'needs_more_research', 'reject', 'flag'] as Action[]).map(a => (
                  <Button key={a} label={ACTION_LABEL[a]} variant={a === 'validate' ? 'primary' : a === 'reject' ? 'destructive' : 'secondary'}
                    size="compact" onPress={() => setPending({ action: a, ids: [r.id] })} />
                ))}
              </View>
            </View>
          );
        })}
        {rows.length < total && <Button label={`Load more (${rows.length} of ${total})`} variant="text" onPress={() => load(rows.length)} />}
      </View>

      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={s.backdrop}>
          <View style={[s.card, s.dialog]}>
            <Text style={s.setTitle}>{pending ? `${ACTION_LABEL[pending.action]} ${pending.ids.length} pin${pending.ids.length === 1 ? '' : 's'}?` : ''}</Text>
            <Text style={s.muted}>
              {pending?.action === 'validate'
                ? 'Only pins you have checked against a source are validated; the others are left unchanged and listed. The catalogue itself is not changed.'
                : pending?.action === 'flag' ? 'Describe the issue. It is saved with your name and fed to the research queue.'
                : 'Add a short note. Research needed is fed to the hourly research queue.'}
            </Text>
            {(needsNote || pending?.action === 'validate') && (
              <TextInput style={[s.input, { minHeight: 64 }]} multiline placeholder={pending?.action === 'validate' ? 'Note (optional; needed for regional variants)' : 'Note'}
                value={note} onChangeText={setNote} accessibilityLabel="Decision note" />
            )}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }} />
              <Button label="Cancel" variant="text" onPress={() => { setPending(null); setNote(''); }} />
              <Button label={busy ? 'Saving…' : 'Save'} loading={busy} disabled={!!needsNote && note.trim().length < 3}
                variant={pending?.action === 'reject' ? 'destructive' : 'primary'} onPress={run} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!checks} transparent animationType="fade" onRequestClose={() => setChecks(null)}>
        <View style={s.backdrop}>
          <View style={[s.card, s.dialog]} testID="checks-result">
            <Text style={s.setTitle}>Your spreadsheet checks</Text>
            {checks && (
              <>
                <Text style={s.muted}>
                  {`${checks.matched} of ${checks.checks} checks matched pins in this run. Recorded under your name: ${checks.recorded.ok} OK, `
                    + `${checks.recorded.research_needed} research needed, ${checks.recorded.flagged} flagged`
                    + `${checks.alreadyRecorded ? `; ${checks.alreadyRecorded} were already recorded` : ''}.`}
                </Text>
                {checks.unknownCount > 0 && <Text style={s.muted}>{`${checks.unknownCount} not in this run (e.g. ${checks.unknown[0]}).`}</Text>}
                {checks.unrecognised.length > 0 && <Text style={s.muted}>{`Not understood: ${checks.unrecognised.slice(0, 3).join('; ')}.`}</Text>}
                <Text style={s.setTitle}>{`${checks.ready.length} ready to validate`}</Text>
                {checks.heldCount > 0 && (
                  <View>
                    <Text style={s.muted}>{`${checks.heldCount} held back, to decide on their own page:`}</Text>
                    {heldSummary(checks.held).slice(0, 4).map(line => <Text key={line} style={s.muted}>{`• ${line}`}</Text>)}
                  </View>
                )}
                <Text style={s.muted}>Validating does not change the catalogue; importing approved pins is a separate step.</Text>
              </>
            )}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }} />
              <Button label="Close" variant="text" onPress={() => setChecks(null)} />
              <Button label={checksBusy ? 'Validating…' : `Validate ${checks?.ready.length ?? 0}`} loading={checksBusy}
                disabled={!checks?.ready.length} onPress={approveReady} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  card: { backgroundColor: c.homeSurface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.homeLine, padding: spacing.lg, gap: spacing.md },
  setTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: c.homeInk },
  muted: { fontSize: 13, fontFamily: 'Inter_400Regular', color: c.homeMuted },
  notice: { fontSize: 13, fontFamily: 'Inter_500Medium', color: c.homeTeal },
  filterRow: { gap: 6 },
  filterLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: c.homeMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  pill: { borderWidth: 1, borderColor: c.homeLine, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  pillOn: { backgroundColor: c.homeInk, borderColor: c.homeInk },
  pillText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: c.homeInk },
  pillTextOn: { color: c.homeSurface },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  input: { flexGrow: 1, minWidth: 180, borderWidth: 1, borderColor: c.homeLine, borderRadius: radius.md, padding: spacing.md, fontSize: 14,
    fontFamily: 'Inter_400Regular', color: c.homeInk, backgroundColor: c.homeBackground },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44, flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.homeLine },
  rowSelected: { backgroundColor: c.homeAqua },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_500Medium', color: c.homeInk },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tick: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  batch: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  dialog: { width: '100%', maxWidth: 520 },
});
