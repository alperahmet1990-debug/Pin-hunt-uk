/**
 * Admin — review one board scan (routes/board-scans.ts).
 *
 * The board photo with every detected pin outlined, and a card per pin:
 * its crop, the cleaned catalogue photo (when one was made), the suggested
 * catalogue match and alternatives. Pins the catalogue has no photo of are
 * listed first. The reviewer confirms or corrects matches, excludes false
 * detections, adds pins detection missed (tap two corners on the board),
 * and approves cleaned photos — singly or "approve all ready".
 *
 * Nothing is published without an approval here. Board photos and crops are
 * private (short-lived signed URLs).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';

interface Box { x: number; y: number; w: number; h: number }
interface Candidate { pinId: string; title: string; collection: string; imageUrl: string | null; confidence: number; reasoning: string }
interface Item {
  id: string;
  position: number;
  origin: 'detected' | 'manual';
  box: Box;
  quality: { suitable: boolean; reasons: string[]; widthPx: number; heightPx: number } | null;
  match_status: 'pending' | 'suggested' | 'unmatched' | 'failed';
  candidates: Candidate[];
  suggested_pin_id: string | null;
  match_confidence: number | null;
  decision: 'undecided' | 'confirmed' | 'corrected' | 'excluded';
  exclude_reason: string | null;
  priority: number;
  cleanup_status: 'none' | 'skipped' | 'done' | 'failed';
  cleanup_note: string | null;
  image_review: 'none' | 'approved' | 'rejected';
  error: string | null;
  cropUrl: string | null;
  cleanedUrl: string | null;
  targetPinId: string | null;
  targetPin: { title: string; imageUrl: string | null; pendingImages: number } | null;
}
interface Scan {
  id: string;
  title: string | null;
  status: string;
  image_width: number;
  image_height: number;
  imageUrl: string | null;
  processing: boolean;
  permission_public_display: boolean;
  contributor_name: string | null;
  detection_truncated: boolean;
  error: string | null;
}
interface Metrics {
  detected: number; manualAdds: number; falsePositives: number; pinsOnBoard: number;
  detectionRate: number | null; matchAccuracy: number | null; reviewedMatches: number; corrected: number;
  suitableCrops: number; cleaned: number; published: number; manualCorrections: number; undecided: number;
  pixianCalls: number; openaiCalls: number; inputTokens: number; outputTokens: number;
  estimatedCostUsd: number | null; totalSeconds: number | null;
}
interface View_ { scan: Scan; items: Item[]; metrics: Metrics; config: { maxPins: number; pixianConfigured: boolean } }

const PROCESSING = new Set(['queued', 'detecting', 'matching', 'cleaning']);
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued…', detecting: 'Finding pins…', matching: 'Matching pins to the catalogue…', cleaning: 'Cleaning photos…',
  ready: 'Ready to review', partial: 'Partly processed', failed: 'Failed',
};
const REASON_TEXT: Record<string, string> = {
  low_resolution: 'small', blurry: 'blurry', glare: 'glare', cut_off: 'cut off', occluded: 'overlapped',
};
type Filter = 'review' | 'ready' | 'published' | 'excluded' | 'all';

function pct(n: number | null) { return n == null ? '—' : `${Math.round(n * 100)}%`; }

export default function AdminBoardScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [data, setData] = useState<View_ | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('review');
  const [selected, setSelected] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null | 'armed'>(null);
  const [searchFor, setSearchFor] = useState<{ itemId: string } | { box: Box } | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE}/admin/board-scans${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { code: body.code });
    return body;
  }, [token]);

  const load = useCallback(async (isRefresh = false) => {
    if (!token || !id) return;
    try {
      if (isRefresh) setRefreshing(true);
      setData(await api(`/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this board.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, id, token]);

  useEffect(() => { load(); }, [load]);

  // Poll while the server is still working on the board.
  const processing = !!data && (data.scan.processing || PROCESSING.has(data.scan.status));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!processing) return;
    pollRef.current = setInterval(() => load(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [processing, load]);

  const replaceItem = useCallback((item: Item) => {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...item } : i)) });
  }, []);

  const act = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }, []);

  const patch = (itemId: string, body: Record<string, unknown>) => act(`${itemId}:${String(body.action)}`, async () => {
    await api(`/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(body) });
    await load();
  });
  const clean = (itemId: string) => act(`${itemId}:clean`, async () => {
    const r = await api(`/${id}/items/${itemId}/clean`, { method: 'POST', body: JSON.stringify({ force: true }) });
    if (r.item.cleanup_status !== 'done') setNotice(r.item.cleanup_note ?? 'Not cleaned.');
    await load();
  });
  const approve = (itemId: string, replaceExisting = false) => act(`${itemId}:approve`, async () => {
    try {
      await api(`/${id}/items/${itemId}/approve`, { method: 'POST', body: JSON.stringify({ replaceExisting }) });
      setReplaceFor(null);
      await load();
    } catch (e) {
      if ((e as { code?: string }).code === 'pin_has_photo') { setReplaceFor(itemId); return; }
      throw e;
    }
  });
  const approveReady = () => act('approve-ready', async () => {
    const r = await api(`/${id}/approve-ready`, { method: 'POST' });
    setNotice(`Published ${r.approved.length} photo${r.approved.length === 1 ? '' : 's'}.` +
      (r.skipped.length ? ` ${r.skipped.length} need a closer look.` : ''));
    await load();
  });
  const resume = () => act('resume', async () => {
    await api(`/${id}/resume`, { method: 'POST' });
    await load();
  });

  // ── Adding a missed pin: tap the top-left, then the bottom-right corner ──
  const boardHeight = data ? (boardWidth * data.scan.image_height) / data.scan.image_width : 0;
  const onBoardPress = (e: GestureResponderEvent) => {
    if (!drawing || !boardWidth) return;
    const x = e.nativeEvent.locationX / boardWidth;
    const y = e.nativeEvent.locationY / boardHeight;
    if (drawing === 'armed') { setDrawing({ x, y }); return; }
    const box = {
      x: Math.max(0, Math.min(drawing.x, x)), y: Math.max(0, Math.min(drawing.y, y)),
      w: Math.abs(x - drawing.x), h: Math.abs(y - drawing.y),
    };
    setDrawing(null);
    if (box.w < 0.01 || box.h < 0.01) { setNotice('That box is too small — try again.'); return; }
    setSearchFor({ box });
  };

  const items = useMemo(() => {
    const all = [...(data?.items ?? [])].sort((a, b) => b.priority - a.priority || a.position - b.position);
    return all.filter((i) => {
      switch (filter) {
        case 'review': return i.decision === 'undecided' && i.image_review === 'none';
        case 'ready': return i.decision !== 'excluded' && i.cleanup_status === 'done' && i.image_review === 'none';
        case 'published': return i.image_review === 'approved';
        case 'excluded': return i.decision === 'excluded';
        default: return true;
      }
    });
  }, [data, filter]);

  const outline = (i: Item) =>
    i.decision === 'excluded' ? colors.homeMuted
      : i.image_review === 'approved' ? '#2E8B57'
        : i.match_status === 'unmatched' || i.match_status === 'failed' ? colors.destructive
          : i.decision === 'undecided' ? '#E0A100' : colors.homeCoral;

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.homeBackground }]}><ActivityIndicator color={colors.homeCoral} /></View>;
  }
  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Text style={{ color: colors.destructive }}>{error ?? 'Not found'}</Text>
      </View>
    );
  }
  const { scan, metrics } = data;
  const card = [styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }];
  const btn = (key: string, label: string, onPress: () => void, kind: 'primary' | 'plain' | 'danger' = 'plain', disabled = false) => (
    <TouchableOpacity
      key={label}
      disabled={disabled || busy !== null}
      onPress={onPress}
      style={[styles.btn, {
        backgroundColor: kind === 'primary' ? colors.homeCoral : 'transparent',
        borderColor: kind === 'danger' ? colors.destructive : colors.homeCoral,
        opacity: disabled || (busy !== null && busy !== key) ? 0.5 : 1,
      }]}
    >
      {busy === key ? <ActivityIndicator size="small" color={kind === 'primary' ? '#fff' : colors.homeCoral} /> : (
        <Text style={[styles.btnText, { color: kind === 'primary' ? '#fff' : kind === 'danger' ? colors.destructive : colors.homeCoral }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
  const readyCount = data.items.filter((i) => i.decision !== 'excluded' && i.cleanup_status === 'done' && i.image_review === 'none').length;

  return (
    <>
      <Stack.Screen options={{ title: scan.title || 'Board' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />}
      >
        {/* Status + metrics */}
        <View style={card}>
          <View style={styles.rowBetween}>
            <Text style={[styles.status, { color: scan.status === 'failed' ? colors.destructive : colors.homeInk }]}>
              {STATUS_LABEL[scan.status] ?? scan.status}
            </Text>
            {processing ? <ActivityIndicator color={colors.homeCoral} /> : null}
          </View>
          {scan.error ? <Text style={[styles.small, { color: colors.destructive }]}>{scan.error}</Text> : null}
          {scan.detection_truncated ? (
            <Text style={[styles.small, { color: colors.destructive }]}>
              More than {data.config.maxPins} pins were found — only the first {data.config.maxPins} are listed. Add any others by hand or split the board.
            </Text>
          ) : null}
          {!scan.permission_public_display ? (
            <Text style={[styles.small, { color: colors.homeMuted }]}>No public display permission: matched only, nothing can be published.</Text>
          ) : null}
          {!data.config.pixianConfigured ? (
            <Text style={[styles.small, { color: colors.homeMuted }]}>Photo clean-up (Pixian) isn't configured on this server.</Text>
          ) : null}
          <Text style={[styles.small, { color: colors.homeMuted }]}>
            {metrics.detected} found · {metrics.manualAdds} added by hand · {metrics.falsePositives} not pins · detection {pct(metrics.detectionRate)} ·
            {' '}match {pct(metrics.matchAccuracy)} of {metrics.reviewedMatches} reviewed · {metrics.cleaned} cleaned · {metrics.published} published ·
            {' '}{metrics.manualCorrections} corrections · {metrics.openaiCalls} AI calls ({Math.round((metrics.inputTokens + metrics.outputTokens) / 1000)}k tokens) ·
            {' '}{metrics.pixianCalls} Pixian{metrics.estimatedCostUsd != null ? ` · ~$${metrics.estimatedCostUsd.toFixed(2)}` : ''}
            {metrics.totalSeconds != null ? ` · ${metrics.totalSeconds}s` : ''}
          </Text>
          <View style={styles.actions}>
            {(scan.status === 'partial' || scan.status === 'failed') && !processing ? btn('resume', 'Resume', resume) : null}
            {scan.permission_public_display && readyCount > 0 ? btn('approve-ready', `Approve all ready (${readyCount})`, approveReady, 'primary') : null}
          </View>
          {notice ? <Text style={[styles.small, { color: colors.homeInk }]}>{notice}</Text> : null}
        </View>

        {/* Board with outlines */}
        {scan.imageUrl ? (
          <View onLayout={(e: LayoutChangeEvent) => setBoardWidth(e.nativeEvent.layout.width)}>
            {boardWidth > 0 ? (
              <Pressable onPress={onBoardPress} style={{ width: boardWidth, height: boardHeight }}>
                <Image source={{ uri: scan.imageUrl }} style={{ width: boardWidth, height: boardHeight, borderRadius: 8 }} />
                {data.items.map((i) => (
                  <Pressable
                    key={i.id}
                    disabled={!!drawing}
                    onPress={() => { setSelected(i.id); setFilter('all'); }}
                    style={{
                      position: 'absolute',
                      left: i.box.x * boardWidth, top: i.box.y * boardHeight,
                      width: i.box.w * boardWidth, height: i.box.h * boardHeight,
                      borderWidth: selected === i.id ? 3 : 2, borderColor: outline(i), borderRadius: 4,
                    }}
                  >
                    <Text style={[styles.tag, { backgroundColor: outline(i) }]}>{i.position}</Text>
                  </Pressable>
                ))}
                {drawing && drawing !== 'armed' ? (
                  <View style={[styles.dot, { left: drawing.x * boardWidth - 5, top: drawing.y * boardHeight - 5 }]} />
                ) : null}
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.actions}>
          {drawing
            ? btn('draw', drawing === 'armed' ? 'Tap the top-left corner… (cancel)' : 'Now the bottom-right corner… (cancel)', () => setDrawing(null))
            : btn('draw', 'Add a missed pin', () => setDrawing('armed'), 'plain', processing)}
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {([['review', 'To review'], ['ready', 'Ready to publish'], ['published', 'Published'], ['excluded', 'Excluded'], ['all', 'All']] as const).map(([f, label]) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.chip, { borderColor: colors.homeLine, backgroundColor: filter === f ? colors.homeAqua : colors.homeSurface }]}
            >
              <Text style={[styles.chipText, { color: colors.homeInk }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.length === 0 ? (
          <Text style={[styles.small, { color: colors.homeMuted }]}>{processing ? 'Pins will appear here as they are processed.' : 'Nothing here.'}</Text>
        ) : items.map((i) => {
          const top = i.candidates[0];
          const target = i.targetPinId;
          const targetTitle = i.candidates.find((c) => c.pinId === target)?.title ?? i.targetPin?.title ?? target;
          return (
            <View key={i.id} style={[card, selected === i.id && { borderColor: colors.homeCoral, borderWidth: 2 }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.itemTitle, { color: colors.homeInk }]}>
                  #{i.position}{i.origin === 'manual' ? ' (added)' : ''}
                </Text>
                <View style={styles.badges}>
                  {target && i.targetPin && !i.targetPin.imageUrl && i.image_review !== 'approved' ? (
                    <Text style={[styles.badge, { backgroundColor: colors.homeWarmSurface, color: colors.homeSand }]}>No catalogue photo</Text>
                  ) : null}
                  {i.quality && !i.quality.suitable ? (
                    <Text style={[styles.badge, { backgroundColor: colors.homeAqua, color: colors.homeMuted }]}>
                      {i.quality.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ')}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.images}>
                {i.cropUrl ? <Image source={{ uri: i.cropUrl }} style={styles.thumb} resizeMode="contain" /> : null}
                {i.cleanedUrl ? <Image source={{ uri: i.cleanedUrl }} style={[styles.thumb, { backgroundColor: '#fff' }]} resizeMode="contain" /> : null}
                {i.targetPin?.imageUrl ? <Image source={{ uri: i.targetPin.imageUrl }} style={[styles.thumb, { opacity: 0.8 }]} resizeMode="contain" /> : null}
              </View>
              <Text style={[styles.tiny, { color: colors.homeMuted }]}>
                Crop{i.cleanedUrl ? ' · Cleaned' : ''}{i.targetPin?.imageUrl ? ' · Current catalogue photo' : ''}
              </Text>

              {i.match_status === 'pending' ? (
                <Text style={[styles.small, { color: colors.homeMuted }]}>Matching…</Text>
              ) : i.match_status === 'failed' ? (
                <Text style={[styles.small, { color: colors.destructive }]}>Matching failed{i.error ? `: ${i.error}` : ''}</Text>
              ) : target ? (
                <Text style={[styles.match, { color: colors.homeInk }]}>
                  {targetTitle} <Text style={{ color: colors.homeMuted }}>· {target}</Text>
                  {i.decision === 'undecided' && top ? <Text style={{ color: colors.homeMuted }}> · {top.confidence}%</Text> : null}
                  {i.decision === 'confirmed' || i.decision === 'corrected' ? <Text style={{ color: '#2E8B57' }}> ✓</Text> : null}
                </Text>
              ) : (
                <Text style={[styles.small, { color: colors.destructive }]}>Not identified — choose the pin.</Text>
              )}
              {i.decision === 'undecided' && top?.reasoning ? (
                <Text style={[styles.tiny, { color: colors.homeMuted }]}>{top.reasoning}</Text>
              ) : null}

              {/* Alternatives: one tap to switch */}
              {i.decision !== 'excluded' && i.image_review !== 'approved' && i.candidates.length > 1 ? (
                <View style={styles.badges}>
                  {i.candidates.filter((c) => c.pinId !== target).map((c) => (
                    <TouchableOpacity
                      key={c.pinId}
                      onPress={() => patch(i.id, { action: 'set_pin', pinId: c.pinId })}
                      style={[styles.chip, { borderColor: colors.homeLine }]}
                    >
                      <Text style={[styles.chipText, { color: colors.homeInk }]} numberOfLines={1}>{c.title} · {c.confidence}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {i.cleanup_note && i.cleanup_status !== 'done' ? (
                <Text style={[styles.tiny, { color: colors.homeMuted }]}>{i.cleanup_note}</Text>
              ) : null}
              {i.decision === 'excluded' ? (
                <Text style={[styles.small, { color: colors.homeMuted }]}>Excluded ({(i.exclude_reason ?? '').replace(/_/g, ' ')})</Text>
              ) : null}
              {i.image_review === 'approved' ? <Text style={[styles.small, { color: '#2E8B57' }]}>Published to the catalogue.</Text> : null}
              {i.image_review === 'rejected' ? <Text style={[styles.small, { color: colors.homeMuted }]}>Photo rejected.</Text> : null}

              <View style={styles.actions}>
                {i.decision === 'excluded' ? btn(`${i.id}:reset`, 'Restore', () => patch(i.id, { action: 'reset' })) : i.image_review === 'approved' ? null : (
                  <>
                    {i.decision === 'undecided' && i.suggested_pin_id ? btn(`${i.id}:confirm`, 'Confirm match', () => patch(i.id, { action: 'confirm' }), 'primary') : null}
                    {btn(`${i.id}:search`, target ? 'Change pin' : 'Choose pin', () => setSearchFor({ itemId: i.id }))}
                    {scan.permission_public_display && i.cleanup_status !== 'done' && target && data.config.pixianConfigured
                      ? btn(`${i.id}:clean`, 'Clean photo', () => clean(i.id)) : null}
                    {i.cleanup_status === 'done' && i.image_review === 'none' ? (
                      <>
                        {btn(`${i.id}:approve`, 'Approve photo', () => approve(i.id), 'primary')}
                        {btn(`${i.id}:reject_image`, 'Reject photo', () => patch(i.id, { action: 'reject_image' }), 'danger')}
                      </>
                    ) : null}
                    {btn(`${i.id}:exclude`, 'Not a pin', () => patch(i.id, { action: 'exclude', reason: 'not_a_pin' }), 'danger')}
                    {btn(`${i.id}:exclude-dup`, 'Duplicate', () => patch(i.id, { action: 'exclude', reason: 'duplicate' }))}
                    {btn(`${i.id}:exclude-skip`, 'Skip', () => patch(i.id, { action: 'exclude', reason: 'not_wanted' }))}
                  </>
                )}
              </View>
              {replaceFor === i.id ? (
                <View style={styles.actions}>
                  <Text style={[styles.small, { color: colors.homeInk, flexBasis: '100%' }]}>This pin already has a catalogue photo.</Text>
                  {btn(`${i.id}:approve`, 'Replace it', () => approve(i.id, true), 'primary')}
                  {btn(`${i.id}:keep`, 'Keep current', () => setReplaceFor(null))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <PinSearchModal
        visible={!!searchFor}
        onClose={() => setSearchFor(null)}
        apiBase={API_BASE}
        token={token}
        allowAuto={!!searchFor && 'box' in searchFor}
        onPick={(pinId) => {
          const target = searchFor;
          setSearchFor(null);
          if (!target) return;
          if ('itemId' in target) {
            if (pinId) patch(target.itemId, { action: 'set_pin', pinId });
          } else {
            act('add', async () => {
              await api(`/${id}/items`, { method: 'POST', body: JSON.stringify({ box: target.box, pinId: pinId ?? undefined }) });
              await load();
              setFilter('all');
            });
          }
        }}
      />
    </>
  );
}

/** Catalogue search for corrections and hand-added pins. */
function PinSearchModal(props: {
  visible: boolean;
  onClose: () => void;
  apiBase: string;
  token: string | undefined;
  allowAuto: boolean;
  onPick: (pinId: string | null) => void;
}) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!props.visible) { setQ(''); setResults([]); setErr(null); } }, [props.visible]);

  const run = useCallback(async () => {
    if (q.trim().length < 2 || !props.token) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${props.apiBase}/admin/board-scans-pin-search?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${props.token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Search failed');
      setResults(body.pins);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q, props.apiBase, props.token]);

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modal, { backgroundColor: colors.homeSurface }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.itemTitle, { color: colors.homeInk }]}>Which pin is it?</Text>
            <TouchableOpacity onPress={props.onClose}><Feather name="x" size={20} color={colors.homeMuted} /></TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: colors.homeLine, color: colors.homeInk }]}
              placeholder="Title, character, set or PHUK-…"
              placeholderTextColor={colors.homeMuted}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={run}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={run} style={[styles.btn, { borderColor: colors.homeCoral }]}>
              {loading ? <ActivityIndicator size="small" color={colors.homeCoral} /> : <Feather name="search" size={16} color={colors.homeCoral} />}
            </TouchableOpacity>
          </View>
          {props.allowAuto ? (
            <TouchableOpacity onPress={() => props.onPick(null)} style={[styles.btn, { borderColor: colors.homeCoral, alignSelf: 'flex-start' }]}>
              <Text style={[styles.btnText, { color: colors.homeCoral }]}>Don't know — match it automatically</Text>
            </TouchableOpacity>
          ) : null}
          {err ? <Text style={[styles.small, { color: colors.destructive }]}>{err}</Text> : null}
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
            {results.map((p) => (
              <TouchableOpacity key={p.pinId} onPress={() => props.onPick(p.pinId)} style={[styles.result, { borderColor: colors.homeLine }]}>
                {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={styles.resultImg} /> : <View style={[styles.resultImg, { backgroundColor: colors.homeAqua }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.small, { color: colors.homeInk }]} numberOfLines={2}>{p.title}</Text>
                  <Text style={[styles.tiny, { color: colors.homeMuted }]}>{p.pinId} · {p.collection}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, padding: 12, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  status: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  small: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  tiny: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', minHeight: 34 },
  btnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tag: { position: 'absolute', top: -2, left: -2, color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold', paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#E0A100' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 260 },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  itemTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, justifyContent: 'flex-end' },
  badge: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  images: { flexDirection: 'row', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 6, backgroundColor: '#0001' },
  match: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 },
  modal: { borderRadius: 14, padding: 16, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontFamily: 'Inter_400Regular' },
  result: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 6 },
  resultImg: { width: 44, height: 44, borderRadius: 4 },
});
