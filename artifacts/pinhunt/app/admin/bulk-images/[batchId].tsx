/**
 * Admin Bulk Image Matcher — one batch (App Creator only, staging first).
 *
 *   Dashboard  counts for every stage, auto-refreshing while work runs.
 *   Upload     drag-and-drop (web) or choose photos; a few at a time.
 *   Review     one photo at a time beside its best catalogue match. Enter
 *              confirms, 1–5 picks another candidate, S skips, F flags,
 *              / searches the catalogue. Advances automatically.
 *   Publish    Pixian results to approve, re-match, or crop to the pin and
 *              clean again (photos with neighbouring pins in frame).
 *   Problems   failed steps (retry only that step), skipped photos.
 *
 * Everything lives on the server, so closing the page loses nothing:
 * opening the batch again resumes matching and clean-up.
 *
 * Pin & Pop images appear only here, as admin-only matching references
 * (migration 042) — they are never published or shown to collectors.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  useWindowDimensions, View, type GestureResponderEvent,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import {
  filesToUploads, pickPhotos, uploadAll, type PendingUpload, type UploadOutcome,
} from '@/utils/bulkImageUpload';

// ── Types (shapes from routes/bulk-images.ts) ────────────────────────────────

type Status = 'uploaded' | 'matching' | 'suggested' | 'unmatched' | 'flagged' | 'skipped'
  | 'confirmed' | 'cleaning' | 'cleaned' | 'published' | 'failed';
type Band = 'confident' | 'possible' | 'uncertain' | 'none';

interface ListItem {
  id: string;
  status: Status;
  failed_stage: 'match' | 'clean' | 'publish' | null;
  error: string | null;
  original_filename: string | null;
  originalUrl: string | null;
  cleanedUrl: string | null;
  top_confidence: number | null;
  match_band: Band | null;
  matched_pinhunt_id: string | null;
  matchedTitle: string | null;
  topCandidate: { pinhuntId: string; title: string } | null;
  pixian_calls: number;
  published_image_url: string | null;
}
interface Summary {
  total: number;
  awaitingMatching: number;
  awaitingReview: number;
  confirmed: number;
  cleaned: number;
  awaitingPublish: number;
  published: number;
  counts: Record<Status, number>;
  failedByStage: Record<string, number>;
}
interface BatchData {
  batch: { id: string; title: string; supplier_name: string; permission_public_display: boolean };
  summary: Summary;
  running: { match: boolean; clean: boolean };
  paused: { match?: string; clean?: string };
  services: { matching: boolean; pixian: boolean };
  items: ListItem[];
}
interface Candidate {
  pinhuntId: string;
  title: string;
  collection: string;
  brand: string;
  edition: string | null;
  characters: string[];
  imageUrl: string | null;
  confidence?: number;
  reasoning?: string;
}
interface PinAndPopRef { externalId?: string; imageUrl?: string }
interface ItemDetail {
  item: ListItem & { candidates: Candidate[]; match_verified: boolean; review_notes: string | null };
  pinAndPop: Record<string, PinAndPopRef>;
}

const REVIEW: Status[] = ['suggested', 'unmatched', 'flagged'];
const WORKING: Status[] = ['uploaded', 'matching', 'confirmed', 'cleaning'];
type Tab = 'review' | 'publish' | 'problems';
type ReviewFilter = 'all' | 'confident' | 'unsure' | 'unmatched' | 'flagged';

// ── API helper ───────────────────────────────────────────────────────────────

function useApi() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useCallback(async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, data });
    return data as T;
  }, [token]);
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function BulkImageBatchScreen() {
  const colors = useColors();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { session } = useAuth();
  const api = useApi();

  const [data, setData] = useState<BatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('review');

  const load = useCallback(async () => {
    try {
      setData(await api<BatchData>(`/admin/bulk-images/batches/${batchId}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the batch.');
    }
  }, [api, batchId]);

  // Resume background work whenever the batch is opened.
  useEffect(() => {
    if (!session?.access_token) return;
    api(`/admin/bulk-images/batches/${batchId}/process`, { method: 'POST', body: {} }).catch(() => {});
    load();
  }, [session?.access_token, api, batchId, load]);

  // Refresh while anything is still being worked on.
  const busy = !!data && (data.items.some((i) => WORKING.includes(i.status)) || data.running.match || data.running.clean);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  /** Optimistic local change so review can move on without waiting. */
  const patchItem = useCallback((id: string, patch: Partial<ListItem>) => {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }, []);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: 'Batch' }} />
        {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : <ActivityIndicator color={colors.homeCoral} />}
      </View>
    );
  }

  const s = data.summary;
  const problems = s.counts.failed + s.counts.skipped;

  return (
    <>
      <Stack.Screen options={{ title: data.batch.title }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text style={[styles.meta, { color: colors.homeMuted }]}>
          Supplied by {data.batch.supplier_name}
          {data.batch.permission_public_display ? '' : ' · no public display permission — photos can\'t be published'}
        </Text>

        <View style={styles.stats}>
          <Stat label="Uploaded" value={s.total} />
          <Stat label="Matching" value={s.awaitingMatching} busy={data.running.match} />
          <Stat label="To review" value={s.awaitingReview} />
          <Stat label="Confirmed" value={s.confirmed} />
          <Stat label="Cleaned" value={s.cleaned} busy={data.running.clean} />
          <Stat label="Published" value={s.published} />
          <Stat label="Failed / skipped / unmatched" value={problems + s.counts.unmatched} warn={problems > 0} />
        </View>

        {!data.services.matching && <Notice text="AI matching isn't configured on this server — photos will wait as uploaded." />}
        {!data.services.pixian && <Notice text="Pixian isn't configured on this server — confirmed photos will wait for clean-up." />}
        {data.paused.match && <Notice text={data.paused.match} />}
        {data.paused.clean && <Notice text={data.paused.clean} />}

        <UploadPanel batchId={data.batch.id} token={session?.access_token} onUploaded={load} />

        <View style={styles.tabs}>
          <TabButton label={`Review (${s.awaitingReview})`} on={tab === 'review'} onPress={() => setTab('review')} />
          <TabButton label={`Publish (${s.awaitingPublish})`} on={tab === 'publish'} onPress={() => setTab('publish')} />
          <TabButton label={`Problems (${problems})`} on={tab === 'problems'} onPress={() => setTab('problems')} />
        </View>

        {tab === 'review' && <ReviewPanel items={data.items} patchItem={patchItem} reload={load} />}
        {tab === 'publish' && (
          <PublishPanel items={data.items.filter((i) => i.status === 'cleaned' || i.status === 'confirmed' || i.status === 'cleaning')}
            canPublish={data.batch.permission_public_display} patchItem={patchItem} reload={load} />
        )}
        {tab === 'problems' && <ProblemsPanel batchId={data.batch.id} items={data.items} reload={load} />}
      </ScrollView>
    </>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, busy, warn }: { label: string; value: number; busy?: boolean; warn?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.homeSurface, borderColor: warn ? colors.destructive : colors.homeLine }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[styles.statValue, { color: colors.homeInk }]}>{value}</Text>
        {busy && <ActivityIndicator size="small" color={colors.homeCoral} />}
      </View>
      <Text style={[styles.statLabel, { color: colors.homeMuted }]}>{label}</Text>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { borderColor: colors.wanted }]}>
      <Feather name="alert-circle" size={14} color={colors.wanted} />
      <Text style={[styles.meta, { color: colors.homeInk, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function TabButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress}
      style={[styles.tab, { backgroundColor: on ? colors.homeCoral : colors.homeSurface, borderColor: on ? colors.homeCoral : colors.homeLine }]}>
      <Text style={{ color: on ? colors.homeHeroText : colors.homeInk, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Btn({ label, onPress, kind = 'secondary', disabled, icon }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
}) {
  const colors = useColors();
  const bg = kind === 'primary' ? colors.homeCoral : 'transparent';
  const fg = kind === 'primary' ? colors.homeHeroText : kind === 'danger' ? colors.destructive : colors.homeInk;
  const border = kind === 'primary' ? colors.homeCoral : kind === 'danger' ? colors.destructive : colors.homeLine;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }]}>
      {icon && <Feather name={icon} size={14} color={fg} />}
      <Text style={{ color: fg, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function BandBadge({ band, confidence }: { band: Band | null; confidence?: number | null }) {
  const colors = useColors();
  const map: Record<Band, { label: string; color: string }> = {
    confident: { label: 'Confident', color: colors.owned },
    possible: { label: 'Possible', color: colors.wanted },
    uncertain: { label: 'Uncertain', color: colors.destructive },
    none: { label: 'No match', color: colors.destructive },
  };
  const m = map[band ?? 'none'];
  return (
    <View style={[styles.badge, { borderColor: m.color, backgroundColor: m.color + '18' }]}>
      <Text style={{ color: m.color, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
        {m.label}{confidence != null ? ` · ${confidence}%` : ''}
      </Text>
    </View>
  );
}

function Photo({ uri, label, caption, size = 260 }: { uri?: string | null; label: string; caption?: string; size?: number }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4, width: size, maxWidth: '100%' }}>
      <Text style={[styles.photoLabel, { color: colors.homeInk }]}>{label}</Text>
      <View style={[styles.photoBox, { width: '100%', backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : (
          <View style={styles.center}><Feather name="image" size={20} color={colors.homeMuted} /></View>
        )}
      </View>
      {caption && <Text style={[styles.meta, { color: colors.homeMuted }]} numberOfLines={2}>{caption}</Text>}
    </View>
  );
}

// ── Upload ───────────────────────────────────────────────────────────────────

function UploadPanel({ batchId, token, onUploaded }: { batchId: string; token?: string; onUploaded: () => void }) {
  const colors = useColors();
  const dropRef = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [results, setResults] = useState<Record<string, { outcome: UploadOutcome; error?: string }>>({});
  const [uploading, setUploading] = useState(false);

  const start = useCallback(async (uploads: PendingUpload[]) => {
    if (!token || uploads.length === 0) return;
    setPending((p) => [...p.filter((x) => !uploads.some((u) => u.key === x.key)), ...uploads]);
    setUploading(true);
    let sinceRefresh = 0;
    await uploadAll(batchId, token, uploads, (key, outcome, error) => {
      setResults((r) => ({ ...r, [key]: { outcome, error } }));
      if (++sinceRefresh >= 5) { sinceRefresh = 0; onUploaded(); }
    });
    setUploading(false);
    onUploaded();
  }, [batchId, token, onUploaded]);

  // Web drag-and-drop onto the panel (react-native-web renders a div).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = dropRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files) start(filesToUploads(e.dataTransfer.files));
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [start]);

  const done = pending.filter((p) => results[p.key]);
  const failed = pending.filter((p) => results[p.key]?.outcome === 'failed');
  const dupes = pending.filter((p) => results[p.key]?.outcome === 'duplicate').length;

  return (
    <View ref={dropRef}
      style={[styles.drop, { borderColor: dragging ? colors.homeCoral : colors.homeLine, backgroundColor: dragging ? colors.homeAqua : colors.homeSurface }]}>
      <Feather name="upload-cloud" size={22} color={colors.homeCoral} />
      <Text style={[styles.dropTitle, { color: colors.homeInk }]}>
        {Platform.OS === 'web' ? 'Drop pin photos here' : 'Add pin photos'}
      </Text>
      <Text style={[styles.meta, { color: colors.homeMuted, textAlign: 'center' }]}>
        One pin per photo. Photos already in this batch are recognised and skipped.
      </Text>
      <Btn label="Choose photos" icon="image" onPress={async () => start(await pickPhotos())} disabled={uploading} />
      {pending.length > 0 && (
        <Text style={[styles.meta, { color: colors.homeInk }]}>
          {uploading ? 'Uploading… ' : ''}{done.length}/{pending.length} sent
          {dupes ? ` · ${dupes} already in batch` : ''}{failed.length ? ` · ${failed.length} failed` : ''}
        </Text>
      )}
      {!uploading && failed.length > 0 && (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={[styles.meta, { color: colors.destructive }]} numberOfLines={2}>
            {failed[0].name}: {results[failed[0].key]?.error}
          </Text>
          <Btn label={`Retry ${failed.length} failed upload${failed.length === 1 ? '' : 's'}`} icon="refresh-cw" onPress={() => start(failed)} />
        </View>
      )}
    </View>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

function ReviewPanel({ items, patchItem, reload }: {
  items: ListItem[]; patchItem: (id: string, p: Partial<ListItem>) => void; reload: () => void;
}) {
  const colors = useColors();
  const api = useApi();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ results: Candidate[]; pinAndPop: Record<string, PinAndPopRef> } | null>(null);
  const searchRef = useRef<TextInput>(null);
  const detailCache = useRef(new Map<string, ItemDetail>());

  const queue = useMemo(() => items.filter((i) => {
    if (!REVIEW.includes(i.status)) return false;
    if (filter === 'confident') return i.status === 'suggested' && i.match_band === 'confident';
    if (filter === 'unsure') return i.status === 'suggested' && i.match_band !== 'confident';
    if (filter === 'unmatched') return i.status === 'unmatched';
    if (filter === 'flagged') return i.status === 'flagged';
    return true;
  }), [items, filter]);

  // Keep the current photo while it's still in the queue; otherwise take the next.
  useEffect(() => {
    if (currentId && queue.some((i) => i.id === currentId)) return;
    setCurrentId(queue[0]?.id ?? null);
  }, [queue, currentId]);

  const fetchDetail = useCallback(async (id: string) => {
    const cached = detailCache.current.get(id);
    if (cached) return cached;
    const d = await api<ItemDetail>(`/admin/bulk-images/items/${id}`);
    detailCache.current.set(id, d);
    return d;
  }, [api]);

  useEffect(() => {
    setDetail(null);
    setSelected(0);
    setSearchResults(null);
    setQuery('');
    setActionError(null);
    if (!currentId) return;
    let live = true;
    fetchDetail(currentId).then((d) => { if (live) setDetail(d); }).catch((e) => live && setActionError(e.message));
    // Prefetch the next photo so advancing is instant.
    const idx = queue.findIndex((i) => i.id === currentId);
    const next = queue[idx + 1];
    if (next) fetchDetail(next.id).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const advance = useCallback(() => {
    const idx = queue.findIndex((i) => i.id === currentId);
    setCurrentId(queue[idx + 1]?.id ?? queue.find((i) => i.id !== currentId)?.id ?? null);
  }, [queue, currentId]);

  const act = useCallback(async (path: string, body: unknown, patch: Partial<ListItem>) => {
    if (!currentId) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/admin/bulk-images/items/${currentId}/${path}`, { method: 'POST', body });
      detailCache.current.delete(currentId);
      patchItem(currentId, patch);
      advance();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [api, currentId, patchItem, advance, reload]);

  const candidates = detail?.item.candidates ?? [];
  const confirm = useCallback((c: Candidate | undefined, method?: 'manual_search') => {
    if (!c) return;
    act('confirm', { pinhuntId: c.pinhuntId, method }, { status: 'confirmed', matched_pinhunt_id: c.pinhuntId, matchedTitle: c.title });
  }, [act]);
  const skip = useCallback(() => act('skip', {}, { status: 'skipped' }), [act]);
  const flag = useCallback(() => act('flag', {}, { status: 'flagged' }), [act]);

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setSearchResults(await api(`/admin/bulk-images/search?q=${encodeURIComponent(query.trim())}`));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }, [api, query]);

  // Keyboard shortcuts on web: Enter confirm · 1–5 pick · S skip · F flag · / search.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (busy || !detail) return;
      if (e.key === 'Enter' && candidates.length) { e.preventDefault(); confirm(candidates[selected]); }
      else if (/^[1-5]$/.test(e.key) && Number(e.key) <= candidates.length) setSelected(Number(e.key) - 1);
      else if (e.key === 's' || e.key === 'S') skip();
      else if (e.key === 'f' || e.key === 'F') flag();
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, detail, candidates, selected, confirm, skip, flag]);

  const reviewTotal = items.filter((i) => REVIEW.includes(i.status)).length;
  const reviewed = items.filter((i) => ['confirmed', 'cleaning', 'cleaned', 'published', 'skipped'].includes(i.status)).length;
  const filters: Array<[ReviewFilter, string]> = [
    ['all', 'All'], ['confident', 'Confident'], ['unsure', 'Possible / uncertain'], ['unmatched', 'No match'], ['flagged', 'Flagged'],
  ];

  const refFor = (c: Candidate, refs: Record<string, PinAndPopRef>) =>
    c.imageUrl
      ? { uri: c.imageUrl, caption: 'PinHunt catalogue photo' }
      : refs[c.pinhuntId]?.imageUrl
        ? { uri: refs[c.pinhuntId].imageUrl!, caption: `Pin & Pop reference #${refs[c.pinhuntId].externalId ?? '?'} · admin only` }
        : { uri: null, caption: 'No reference image' };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.rowWrap}>
        {filters.map(([k, label]) => (
          <Pressable key={k} onPress={() => setFilter(k)}
            style={[styles.chip, { borderColor: filter === k ? colors.homeCoral : colors.homeLine, backgroundColor: filter === k ? colors.homeAqua : 'transparent' }]}>
            <Text style={{ color: colors.homeInk, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.meta, { color: colors.homeMuted }]}>
        {reviewed} reviewed · {reviewTotal} left{queue.length !== reviewTotal ? ` (${queue.length} in this filter)` : ''}
        {Platform.OS === 'web' ? '  ·  Enter confirm · 1–5 choose · S skip · F flag · / search' : ''}
      </Text>

      {!currentId ? (
        <Text style={[styles.meta, { color: colors.homeMuted }]}>Nothing to review here right now.</Text>
      ) : !detail ? (
        actionError ? <Text style={{ color: colors.destructive }}>{actionError}</Text> : <ActivityIndicator color={colors.homeCoral} />
      ) : (
        <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
          <View style={styles.compare}>
            <Photo uri={detail.item.originalUrl} label="Uploaded photo" caption={detail.item.original_filename ?? undefined} />
            {candidates[selected] ? (() => {
              const c = candidates[selected];
              const ref = refFor(c, detail.pinAndPop);
              return (
                <View style={{ gap: 6, flexShrink: 1 }}>
                  <Photo uri={ref.uri} label={selected === 0 ? 'Best match' : `Candidate ${selected + 1}`} caption={ref.caption} />
                  <BandBadge band={selected === 0 ? detail.item.match_band : null} confidence={c.confidence} />
                  <Text style={[styles.h3, { color: colors.homeInk }]}>{c.title}</Text>
                  <Text style={[styles.meta, { color: colors.homeMuted }]}>
                    {c.pinhuntId} · {c.collection} · {c.brand}{c.edition ? ` · ${c.edition}` : ''}
                  </Text>
                  {c.characters.length > 0 && <Text style={[styles.meta, { color: colors.homeMuted }]}>{c.characters.join(', ')}</Text>}
                  {c.reasoning ? <Text style={[styles.meta, { color: colors.homeInk }]}>“{c.reasoning}”</Text> : null}
                </View>
              );
            })() : (
              <View style={{ gap: 6, flexShrink: 1, maxWidth: 260 }}>
                <BandBadge band="none" />
                <Text style={[styles.meta, { color: colors.homeInk }]}>No likely catalogue match. Search the catalogue below, skip, or flag.</Text>
              </View>
            )}
          </View>

          {detail.item.match_band && detail.item.match_band !== 'confident' && candidates.length > 0 && (
            <Text style={[styles.meta, { color: colors.wanted }]}>
              {detail.item.match_verified ? 'Checked against reference images, but not certain.' : 'Not checked against a reference image — compare carefully.'}
            </Text>
          )}

          {candidates.length > 1 && (
            <View style={styles.rowWrap}>
              {candidates.map((c, i) => {
                const ref = refFor(c, detail.pinAndPop);
                const on = i === selected;
                return (
                  <Pressable key={c.pinhuntId} onPress={() => setSelected(i)}
                    style={[styles.alt, { borderColor: on ? colors.homeCoral : colors.homeLine, backgroundColor: on ? colors.homeAqua : 'transparent' }]}>
                    <View style={[styles.altImg, { backgroundColor: colors.homeAqua }]}>
                      {ref.uri ? <Image source={{ uri: ref.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
                    </View>
                    <Text style={[styles.meta, { color: colors.homeInk }]} numberOfLines={2}>{i + 1}. {c.title}</Text>
                    <Text style={[styles.meta, { color: colors.homeMuted }]}>{c.confidence ?? '–'}%</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.rowWrap}>
            <Btn kind="primary" icon="check" label={selected === 0 ? 'Confirm match' : `Confirm candidate ${selected + 1}`}
              onPress={() => confirm(candidates[selected])} disabled={busy || candidates.length === 0} />
            <Btn icon="skip-forward" label="Skip" onPress={skip} disabled={busy} />
            <Btn icon="flag" label="Flag as uncertain" onPress={flag} disabled={busy || detail.item.status === 'flagged'} />
          </View>
          {actionError && <Text style={{ color: colors.destructive, fontSize: 13 }}>{actionError}</Text>}

          <View style={[styles.searchRow]}>
            <TextInput ref={searchRef} value={query} onChangeText={setQuery} onSubmitEditing={search}
              placeholder="Search the catalogue (name, set, character or PHUK id)" placeholderTextColor={colors.homeMuted}
              style={[styles.input, { flex: 1, borderColor: colors.homeLine, color: colors.homeInk }]} />
            <Btn icon="search" label="Search" onPress={search} disabled={searching} />
          </View>
          {searching && <ActivityIndicator color={colors.homeCoral} />}
          {searchResults && (searchResults.results.length === 0 ? (
            <Text style={[styles.meta, { color: colors.homeMuted }]}>No pins found.</Text>
          ) : searchResults.results.map((c) => {
            const ref = refFor(c, searchResults.pinAndPop);
            return (
              <View key={c.pinhuntId} style={[styles.searchResult, { borderColor: colors.homeLine }]}>
                <View style={[styles.altImg, { backgroundColor: colors.homeAqua }]}>
                  {ref.uri ? <Image source={{ uri: ref.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.meta, { color: colors.homeInk, fontFamily: 'Inter_600SemiBold' }]}>{c.title}</Text>
                  <Text style={[styles.meta, { color: colors.homeMuted }]}>{c.pinhuntId} · {c.collection}</Text>
                </View>
                <Btn label="Use this pin" onPress={() => confirm(c, 'manual_search')} disabled={busy} />
              </View>
            );
          }))}
        </View>
      )}
    </View>
  );
}

// ── Publish ──────────────────────────────────────────────────────────────────

function PublishPanel({ items, canPublish, patchItem, reload }: {
  items: ListItem[]; canPublish: boolean; patchItem: (id: string, p: Partial<ListItem>) => void; reload: () => void;
}) {
  const colors = useColors();
  const api = useApi();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState<Record<string, string>>({}); // item id → existing image URL
  const [bulk, setBulk] = useState<'idle' | 'confirming' | 'running'>('idle');
  const [cropping, setCropping] = useState<ListItem | null>(null);

  const ready = items.filter((i) => i.status === 'cleaned');
  const waiting = items.length - ready.length;

  const publish = useCallback(async (item: ListItem, replaceExisting = false) => {
    setBusyId(item.id);
    setErrors((e) => ({ ...e, [item.id]: '' }));
    try {
      await api(`/admin/bulk-images/items/${item.id}/publish`, { method: 'POST', body: { replaceExisting } });
      patchItem(item.id, { status: 'published' });
      setReplace((r) => { const { [item.id]: _, ...rest } = r; return rest; });
    } catch (e) {
      const err = e as Error & { data?: { code?: string; existingImageUrl?: string } };
      if (err.data?.code === 'has_image' && err.data.existingImageUrl) {
        setReplace((r) => ({ ...r, [item.id]: err.data!.existingImageUrl! }));
      } else {
        setErrors((x) => ({ ...x, [item.id]: err.message }));
      }
    } finally {
      setBusyId(null);
    }
  }, [api, patchItem]);

  const simple = useCallback(async (item: ListItem, path: 'reclean' | 'reopen', patch: Partial<ListItem>) => {
    setBusyId(item.id);
    try {
      await api(`/admin/bulk-images/items/${item.id}/${path}`, { method: 'POST', body: {} });
      patchItem(item.id, patch);
      reload();
    } catch (e) {
      setErrors((x) => ({ ...x, [item.id]: e instanceof Error ? e.message : 'Failed' }));
    } finally {
      setBusyId(null);
    }
  }, [api, patchItem, reload]);

  const publishAll = async () => {
    setBulk('running');
    // One at a time: each is a storage upload + catalogue write.
    for (const item of ready) if (!replace[item.id]) await publish(item);
    setBulk('idle');
    reload();
  };

  return (
    <View style={{ gap: 12 }}>
      {!canPublish && <Notice text="This batch has no public display permission, so nothing in it can be published." />}
      {waiting > 0 && <Text style={[styles.meta, { color: colors.homeMuted }]}>{waiting} confirmed photo{waiting === 1 ? '' : 's'} still being cleaned…</Text>}
      {ready.length === 0 ? (
        <Text style={[styles.meta, { color: colors.homeMuted }]}>No cleaned photos waiting.</Text>
      ) : canPublish && (
        bulk === 'confirming' ? (
          <View style={[styles.notice, { borderColor: colors.homeCoral }]}>
            <Text style={[styles.meta, { color: colors.homeInk, flex: 1 }]}>
              Publish all {ready.length} cleaned photos shown below? Pins that already have a photo are left for you to confirm one by one.
            </Text>
            <Btn label="Cancel" onPress={() => setBulk('idle')} />
            <Btn kind="primary" label="Publish all" onPress={publishAll} />
          </View>
        ) : (
          <Btn kind="primary" icon="upload" label={bulk === 'running' ? 'Publishing…' : `Publish all ${ready.length} shown`}
            onPress={() => setBulk('confirming')} disabled={bulk === 'running'} />
        )
      )}
      <View style={styles.grid}>
        {ready.map((item) => (
          <View key={item.id} style={[styles.card, styles.gridCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Photo uri={item.originalUrl} label="Uploaded" size={130} />
              <Photo uri={item.cleanedUrl} label="Cleaned (Pixian)" size={130} />
            </View>
            <Text style={[styles.meta, { color: colors.homeInk, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>
              {item.matchedTitle ?? item.matched_pinhunt_id}
            </Text>
            <Text style={[styles.meta, { color: colors.homeMuted }]}>{item.matched_pinhunt_id} · Pixian calls: {item.pixian_calls}</Text>
            {replace[item.id] ? (
              <View style={{ gap: 6 }}>
                <Text style={[styles.meta, { color: colors.wanted }]}>This pin already has a catalogue photo:</Text>
                <Photo uri={replace[item.id]} label="Current photo" size={130} />
                <View style={styles.rowWrap}>
                  <Btn label="Keep current" onPress={() => setReplace((r) => { const { [item.id]: _, ...rest } = r; return rest; })} />
                  <Btn kind="danger" label="Replace it" onPress={() => publish(item, true)} disabled={busyId === item.id} />
                </View>
              </View>
            ) : (
              <View style={styles.rowWrap}>
                <Btn kind="primary" icon="check" label="Publish" onPress={() => publish(item)} disabled={!canPublish || busyId === item.id || bulk === 'running'} />
                <Btn icon="crop" label="Crop & clean" onPress={() => setCropping(item)} disabled={busyId === item.id} />
                <Btn icon="edit-2" label="Change match" onPress={() => simple(item, 'reopen', { status: 'suggested' })} disabled={busyId === item.id} />
              </View>
            )}
            {errors[item.id] ? <Text style={{ color: colors.destructive, fontSize: 12 }}>{errors[item.id]}</Text> : null}
          </View>
        ))}
      </View>
      {cropping && (
        <CropModal item={cropping} onClose={() => setCropping(null)}
          onDone={() => { patchItem(cropping.id, { status: 'confirmed' }); setCropping(null); reload(); }} />
      )}
    </View>
  );
}

// ── Crop ─────────────────────────────────────────────────────────────────────

/**
 * Drag a box around the pin. Only that part of the photo is sent to Pixian,
 * so neighbouring pins on a board aren't kept in the cleaned result.
 */
function CropModal({ item, onClose, onDone }: { item: ListItem; onClose: () => void; onDone: () => void }) {
  const colors = useColors();
  const api = useApi();
  const win = useWindowDimensions();
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.originalUrl) return;
    Image.getSize(item.originalUrl, (w, h) => setNatural({ w, h }), () => setError('Could not load the photo.'));
  }, [item.originalUrl]);

  // Show the photo at its own aspect ratio, so touch positions map straight to fractions.
  const maxW = Math.min(win.width - 48, 640);
  const maxH = win.height * 0.6;
  const scale = natural ? Math.min(maxW / natural.w, maxH / natural.h) : 1;
  const dispW = natural ? natural.w * scale : maxW;
  const dispH = natural ? natural.h * scale : maxW;

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const point = (e: GestureResponderEvent) => ({
    x: clamp(e.nativeEvent.locationX, dispW),
    y: clamp(e.nativeEvent.locationY, dispH),
  });
  const rect = start && end ? {
    left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  } : null;
  const bigEnough = !!rect && rect.width >= dispW * 0.1 && rect.height >= dispH * 0.1;

  const submit = async () => {
    if (!rect || !bigEnough) return;
    setBusy(true);
    setError(null);
    try {
      const box = [rect.left / dispW, rect.top / dispH, (rect.left + rect.width) / dispW, (rect.top + rect.height) / dispH];
      await api(`/admin/bulk-images/items/${item.id}/crop`, { method: 'POST', body: { box } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not crop the photo.');
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.cropBackdrop}>
        <View style={[styles.cropSheet, { backgroundColor: colors.homeSurface }]}>
          <Text style={[styles.h3, { color: colors.homeInk }]}>Crop to the pin</Text>
          <Text style={[styles.meta, { color: colors.homeMuted }]}>
            Drag a box around just this pin — leave out neighbouring pins and the board. Only the box is sent to Pixian.
          </Text>
          <View style={{ width: dispW, height: dispH, alignSelf: 'center', backgroundColor: colors.homeAqua }}>
            {item.originalUrl && natural ? (
              <Image source={{ uri: item.originalUrl }} style={{ width: dispW, height: dispH }} />
            ) : <ActivityIndicator style={{ marginTop: 40 }} color={colors.homeCoral} />}
            {rect && (
              <View pointerEvents="none"
                style={[styles.cropRect, { left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderColor: colors.homeCoral }]} />
            )}
            {/* Transparent layer on top catches the drag (a browser would otherwise drag the <img> itself). */}
            <View
              testID="crop-surface"
              style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ cursor: 'crosshair', userSelect: 'none' } as object) : null]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => { const p = point(e); setStart(p); setEnd(p); }}
              onResponderMove={(e) => setEnd(point(e))}
            />
          </View>
          {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
          <Text style={[styles.meta, { color: colors.homeMuted }]}>Pixian calls used: {item.pixian_calls}</Text>
          <View style={styles.rowWrap}>
            <Btn label="Cancel" onPress={onClose} disabled={busy} />
            <Btn kind="primary" icon="crop" label={busy ? 'Cropping…' : 'Crop & clean'} onPress={submit} disabled={busy || !bigEnough} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Problems ─────────────────────────────────────────────────────────────────

function ProblemsPanel({ batchId, items, reload }: { batchId: string; items: ListItem[]; reload: () => void }) {
  const colors = useColors();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState<ListItem | null>(null);
  const failed = items.filter((i) => i.status === 'failed');
  const skipped = items.filter((i) => i.status === 'skipped');
  const STAGE: Record<string, string> = { match: 'Matching', clean: 'Pixian clean-up', publish: 'Publishing' };

  const run = async (path: string) => {
    setBusy(true);
    try { await api(path, { method: 'POST', body: {} }); } catch { /* shown on reload */ }
    setBusy(false);
    reload();
  };

  return (
    <View style={{ gap: 10 }}>
      {failed.length > 0 && (
        <Btn kind="primary" icon="refresh-cw" label={`Retry all ${failed.length} failed`} disabled={busy}
          onPress={() => run(`/admin/bulk-images/batches/${batchId}/retry-failed`)} />
      )}
      {failed.length === 0 && skipped.length === 0 && <Text style={[styles.meta, { color: colors.homeMuted }]}>No problems.</Text>}
      {[...failed, ...skipped].map((item) => (
        <View key={item.id} style={[styles.problem, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
          <View style={[styles.altImg, { backgroundColor: colors.homeAqua }]}>
            {item.originalUrl ? <Image source={{ uri: item.originalUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.meta, { color: colors.homeInk, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
              {item.original_filename ?? item.id}
            </Text>
            <Text style={[styles.meta, { color: item.status === 'failed' ? colors.destructive : colors.homeMuted }]} numberOfLines={2}>
              {item.status === 'failed' ? `${STAGE[item.failed_stage ?? ''] ?? 'Step'} failed: ${item.error ?? 'unknown error'}` : 'Skipped'}
            </Text>
          </View>
          {item.status === 'failed' && item.failed_stage === 'clean' && (
            <Btn icon="crop" label="Crop & clean" disabled={busy} onPress={() => setCropping(item)} />
          )}
          {item.status === 'failed'
            ? <Btn icon="refresh-cw" label="Retry" disabled={busy} onPress={() => run(`/admin/bulk-images/items/${item.id}/retry`)} />
            : <Btn icon="rotate-ccw" label="Back to review" disabled={busy} onPress={() => run(`/admin/bulk-images/items/${item.id}/reopen`)} />}
        </View>
      ))}
      {cropping && <CropModal item={cropping} onClose={() => setCropping(null)} onDone={() => { setCropping(null); reload(); }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  h3: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, minWidth: 110 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: 10, flexWrap: 'wrap' },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 8 },
  dropTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  compare: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  photoLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  photoBox: { aspectRatio: 1, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  alt: { width: 120, borderWidth: 1, borderRadius: radius.md, padding: 6, gap: 4 },
  altImg: { width: 56, height: 56, borderRadius: radius.sm, overflow: 'hidden' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: 'Inter_400Regular' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: { width: 300, maxWidth: '100%' },
  cropBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  cropSheet: { borderRadius: radius.lg, padding: 16, gap: 10, maxWidth: 680, width: '100%' },
  cropRect: { position: 'absolute', borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  problem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 10 },
});
