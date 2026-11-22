/**
 * Admin — review one board scan (routes/board-scans.ts).
 *
 * The board photo with every detected pin outlined, and a card per pin:
 * its crop, the cleaned catalogue photo (when one was made), the suggested
 * catalogue match and alternatives. Pins the catalogue has no photo of are
 * listed first. The reviewer confirms or corrects matches, excludes false
 * detections, adds pins detection missed (tap two corners on the board),
 * turns cleaned photos straight (automatic for straight-sided pins, or by
 * hand), and approves cleaned photos — singly or "approve all ready".
 * The App Creator also sees each match's Pin & Pop reference image (admin
 * only, as in the Bulk Image Matcher; never stored or published).
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
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { localeFor } from '@/utils/format';

interface Box { x: number; y: number; w: number; h: number }
interface Candidate { pinId: string; title: string; collection: string; imageUrl: string | null; confidence: number; reasoning: string; verified?: boolean; lookalike?: boolean }
interface SearchResult { pinId: string; title: string; collection: string; imageUrl: string | null; referenceUrl?: string | null }
interface Item {
  id: string;
  position: number;
  origin: 'detected' | 'manual';
  /** What the describe step saw; `described` once it ran (shown as "Searched for"). */
  detection?: { characters: string[]; keywords: string[]; text: string; described?: boolean } | null;
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
  stats?: { setHints?: string[]; accuracy?: AccuracyReport } | null;
  /** An accuracy check is running on the server. */
  accuracyRunning?: boolean;
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
interface AccuracyReport {
  at: string; checked: number; top1: number; top5: number; errors: number;
  misses: Array<{ itemId: string; position: number; expected: { pinId: string; title: string | null }; got: { pinId: string; title: string; confidence: number } | null; rank: number | null }>;
}
interface Metrics {
  detected: number; manualAdds: number; falsePositives: number; pinsOnBoard: number;
  detectionRate: number | null; matchAccuracy: number | null; reviewedMatches: number; corrected: number;
  suitableCrops: number; cleaned: number; published: number; manualCorrections: number; undecided: number;
  pixianCalls: number; openaiCalls: number; inputTokens: number; outputTokens: number;
  estimatedCostUsd: number | null; totalSeconds: number | null;
}
interface PinAndPopRef { imageUrl: string | null; externalId: string | null }
interface View_ {
  scan: Scan; items: Item[]; metrics: Metrics; config: { maxPins: number; pixianConfigured: boolean };
  /** App Creator only: Pin & Pop reference images by pinhunt id. */
  pinAndPop?: Record<string, PinAndPopRef>;
}

const PROCESSING = new Set(['queued', 'detecting', 'matching', 'cleaning']);
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued…', detecting: 'Finding pins…', matching: 'Matching pins to the catalogue…', cleaning: 'Cleaning photos…',
  ready: 'Ready to review', partial: 'Partly processed', failed: 'Failed',
};
const REASON_TEXT: Record<string, string> = {
  low_resolution: 'small', blurry: 'blurry', glare: 'glare', cut_off: 'cut off', occluded: 'overlapped',
};
type Filter = 'review' | 'ready' | 'published' | 'excluded' | 'all';

/**
 * Where a tap landed on the board, as fractions (0–1) of its size. On the web,
 * locationX/Y are measured from whatever element was under the pointer (an
 * outline, its number), not the board, so pass the board's on-screen `rect`
 * there and the page position is used instead.
 */
export function boardPoint(
  ev: { locationX: number; locationY: number; pageX: number; pageY: number },
  rect: { left: number; top: number } | null,
  scroll: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const lx = rect ? ev.pageX - (rect.left + scroll.x) : ev.locationX;
  const ly = rect ? ev.pageY - (rect.top + scroll.y) : ev.locationY;
  return { x: Math.max(0, Math.min(1, lx / width)), y: Math.max(0, Math.min(1, ly / height)) };
}

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
  /** A picture opened full size (tap any picture on a card). */
  const [zoom, setZoom] = useState<{ uri: string; label: string; reference?: boolean } | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  /** In-page confirmations (native alerts don't run their buttons on the web). */
  const [boardAction, setBoardAction] = useState<'rescan' | 'delete' | null>(null);
  const [rescanSet, setRescanSet] = useState('');
  const router = useRouter();

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE}/admin/board-scans${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 && body.error === 'Not found') {
      throw new Error('Board scanning is not switched on for this server (BOARD_SCAN_ENABLED).');
    }
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
  const checking = !!data?.scan.accuracyRunning;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!processing && !checking) return;
    pollRef.current = setInterval(() => load(), checking && !processing ? 5000 : 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [processing, checking, load]);

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
    const r = await api(`/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (r?.rematching > 0) {
      setNotice(`Re-matching ${r.rematching} other pin${r.rematching === 1 ? '' : 's'} with "${r.set}" searched first.`);
    }
    await load();
  });
  const clean = (itemId: string) => act(`${itemId}:clean`, async () => {
    const r = await api(`/${id}/items/${itemId}/clean`, { method: 'POST', body: JSON.stringify({ force: true }) });
    if (r.item.cleanup_status !== 'done') setNotice(r.item.cleanup_note ?? 'Not cleaned.');
    await load();
  });
  const rotate = (itemId: string, degrees: number | 'auto') => act(`${itemId}:rotate`, async () => {
    await api(`/${id}/items/${itemId}/rotate`, { method: 'POST', body: JSON.stringify({ degrees }) });
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
  const rescan = () => act('rescan', async () => {
    await api(`/${id}/rescan`, { method: 'POST', body: JSON.stringify({ setHint: rescanSet.trim() || undefined }) });
    setBoardAction(null);
    setRescanSet('');
    setNotice('Scanning this board again from the start…');
    await load();
  });
  const deleteBoard = () => act('delete', async () => {
    await api(`/${id}`, { method: 'DELETE' });
    router.replace('/admin/board-scans' as Href);
  });
  const runAccuracy = () => act('accuracy', async () => {
    const r = await api(`/${id}/accuracy`, { method: 'POST' });
    setNotice(`Checking matching on ${r?.pins ?? 'the'} confirmed pins… This takes a minute or two.`);
    await load();
  });
  const resume = () => act('resume', async () => {
    await api(`/${id}/resume`, { method: 'POST' });
    await load();
  });

  // ── Adding a missed pin: tap the top-left, then the bottom-right corner ──
  const boardHeight = data ? (boardWidth * data.scan.image_height) / data.scan.image_width : 0;
  const boardRef = useRef<View>(null);
  const onBoardPress = (e: GestureResponderEvent) => {
    if (!drawing || !boardWidth) return;
    const node = boardRef.current as unknown as { getBoundingClientRect?: () => { left: number; top: number } } | null;
    const rect = Platform.OS === 'web' && node?.getBoundingClientRect ? node.getBoundingClientRect() : null;
    const scroll = typeof window !== 'undefined' ? { x: window.scrollX, y: window.scrollY } : { x: 0, y: 0 };
    const { x, y } = boardPoint(e.nativeEvent, rect, scroll, boardWidth, boardHeight);
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
  // Same rule as the server (rules.bulkApproveBlock): confirmed by the
  // reviewer, cleaned, crop passed the quality check, pin has no photo yet.
  // Pins with the reviewer's answer: what the accuracy check measures against.
  const answeredCount = data.items.filter((i) => (i.decision === 'confirmed' || i.decision === 'corrected') && !!i.cropUrl).length;
  const readyCount = data.items.filter((i) =>
    (i.decision === 'confirmed' || i.decision === 'corrected') && i.cleanup_status === 'done' && i.image_review === 'none' &&
    i.quality?.suitable === true && !i.targetPin?.imageUrl).length;

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
          {scan.stats?.setHints?.length ? (
            <Text style={[styles.small, { color: colors.homeMuted }]}>
              Sets searched first: {scan.stats.setHints.join(' · ')}
            </Text>
          ) : null}
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
            {!processing && !boardAction ? btn('rescan', 'Scan again', () => setBoardAction('rescan')) : null}
            {!processing && !boardAction ? btn('delete', 'Delete board', () => setBoardAction('delete'), 'danger') : null}
            {!processing && !boardAction && answeredCount > 0
              ? btn('accuracy', checking ? 'Checking accuracy…' : `Accuracy check (${answeredCount})`, runAccuracy, 'plain', checking)
              : null}
          </View>
          {scan.stats?.accuracy ? (
            <AccuracyPanel report={scan.stats.accuracy} items={data.items} running={checking} />
          ) : checking ? (
            <Text style={[styles.small, { color: colors.homeMuted }]}>Checking accuracy… re-matching your confirmed pins.</Text>
          ) : null}
          {boardAction === 'rescan' ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.small, { color: colors.homeInk }]}>
                Find and match every pin on this photo again with the latest matching. Current pins, matches and clean-ups on this board are replaced.
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.homeLine, color: colors.homeInk }]}
                placeholder="Set on this board (optional)"
                placeholderTextColor={colors.homeMuted}
                value={rescanSet}
                onChangeText={setRescanSet}
                accessibilityLabel="Set on this board"
              />
              <View style={styles.actions}>
                {btn('rescan', 'Scan again now', rescan, 'primary')}
                {btn('rescan-cancel', 'Cancel', () => setBoardAction(null))}
              </View>
            </View>
          ) : null}
          {boardAction === 'delete' ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.small, { color: colors.homeInk }]}>
                Delete this board, its pins, matches and photos? This can't be undone. You can then upload the same photo again.
              </Text>
              <View style={styles.actions}>
                {btn('delete', 'Delete board', deleteBoard, 'danger')}
                {btn('delete-cancel', 'Keep it', () => setBoardAction(null))}
              </View>
            </View>
          ) : null}
          {notice ? <Text style={[styles.small, { color: colors.homeInk }]}>{notice}</Text> : null}
        </View>

        {/* Board with outlines */}
        {scan.imageUrl ? (
          <View onLayout={(e: LayoutChangeEvent) => setBoardWidth(e.nativeEvent.layout.width)}>
            {boardWidth > 0 ? (
              <Pressable ref={boardRef} onPress={onBoardPress} style={{ width: boardWidth, height: boardHeight }}>
                <Image source={{ uri: scan.imageUrl }} style={{ width: boardWidth, height: boardHeight, borderRadius: 8 }} />
                {data.items.map((i) => (
                  <Pressable
                    key={i.id}
                    disabled={!!drawing}
                    // While drawing, taps go through the outlines to the board.
                    pointerEvents={drawing ? 'none' : 'auto'}
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
          const ref = target ? data.pinAndPop?.[target] : undefined;
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
                {i.cropUrl ? (
                  <Pressable onPress={() => setZoom({ uri: i.cropUrl!, label: `#${i.position} · Crop` })} accessibilityLabel="Enlarge the crop">
                    <Image source={{ uri: i.cropUrl }} style={styles.thumb} resizeMode="contain" />
                  </Pressable>
                ) : null}
                {i.cleanedUrl ? (
                  <Pressable onPress={() => setZoom({ uri: i.cleanedUrl!, label: `#${i.position} · Cleaned` })} accessibilityLabel="Enlarge the cleaned photo">
                    <Image source={{ uri: i.cleanedUrl }} style={[styles.thumb, { backgroundColor: '#fff' }]} resizeMode="contain" />
                  </Pressable>
                ) : null}
                {i.targetPin?.imageUrl ? (
                  <Pressable onPress={() => setZoom({ uri: i.targetPin!.imageUrl!, label: `${targetTitle} · Current catalogue photo` })} accessibilityLabel="Enlarge the catalogue photo">
                    <Image source={{ uri: i.targetPin.imageUrl }} style={[styles.thumb, { opacity: 0.8 }]} resizeMode="contain" />
                  </Pressable>
                ) : null}
                {ref?.imageUrl ? (
                  <Pressable onPress={() => setZoom({ uri: ref.imageUrl!, label: `${targetTitle} · Pin & Pop reference (admin only)`, reference: true })} accessibilityLabel="Enlarge the Pin & Pop reference image">
                    <Image source={{ uri: ref.imageUrl }} style={[styles.thumb, { backgroundColor: '#fff' }]} resizeMode="contain" referrerPolicy="no-referrer" accessibilityLabel="Pin & Pop reference image" />
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.tiny, { color: colors.homeMuted }]}>
                Crop{i.cleanedUrl ? ' · Cleaned' : ''}{i.targetPin?.imageUrl ? ' · Current catalogue photo' : ''}
                {ref?.imageUrl ? ` · Pin & Pop reference${ref.externalId ? ` #${ref.externalId}` : ''} (admin only)` : ''}
                {i.cropUrl ? ' · Tap a picture to enlarge' : ''}
              </Text>

              {i.match_status === 'pending' ? (
                <Text style={[styles.small, { color: colors.homeMuted }]}>Matching…</Text>
              ) : i.match_status === 'failed' ? (
                <Text style={[styles.small, { color: colors.destructive }]}>Matching failed{i.error ? `: ${i.error}` : ''}</Text>
              ) : target && i.match_status === 'unmatched' && i.decision === 'undecided' ? (
                // Below the match threshold: a guess to check, not a match.
                <Text style={[styles.small, { color: colors.homeSand }]}>
                  Not identified — best guess: {targetTitle} <Text style={{ color: colors.homeMuted }}>· {target}{top ? ` · ${top.confidence}%` : ''}</Text>
                </Text>
              ) : target ? (
                <Text style={[styles.match, { color: colors.homeInk }]}>
                  {targetTitle} <Text style={{ color: colors.homeMuted }}>· {target}</Text>
                  {i.decision === 'undecided' && top ? <Text style={{ color: colors.homeMuted }}> · {top.confidence}%</Text> : null}
                  {i.decision === 'confirmed' || i.decision === 'corrected' ? <Text style={{ color: '#2E8B57' }}> ✓</Text> : null}
                </Text>
              ) : (
                <Text style={[styles.small, { color: colors.destructive }]}>Not identified — choose the pin.</Text>
              )}
              {i.error && i.match_status !== 'failed' && i.decision === 'undecided' ? (
                <Text style={[styles.tiny, { color: colors.homeSand }]}>{i.error}</Text>
              ) : null}
              {i.decision === 'undecided' && top?.reasoning ? (
                <Text style={[styles.tiny, { color: colors.homeMuted }]}>{top.reasoning}</Text>
              ) : null}
              {i.decision === 'undecided' && top && top.verified !== undefined && !(i.error && !top.verified) ? (
                <Text style={[styles.tiny, { color: top.verified ? '#2E8B57' : colors.homeSand }]}>
                  {top.verified ? 'Checked against reference pictures.' : 'Not checked against a picture: compare carefully.'}
                  {top.lookalike ? ' Found by picture search.' : ''}
                </Text>
              ) : null}
              {i.decision === 'undecided' && i.detection?.described ? (
                <Text style={[styles.tiny, { color: colors.homeMuted }]} numberOfLines={2}>
                  Searched for: {[...i.detection.characters, ...i.detection.keywords, ...(i.detection.text ? [`"${i.detection.text}"`] : [])].join(', ') || 'nothing recognisable'}
                </Text>
              ) : null}

              {/* Alternatives: one tap to switch */}
              {i.decision !== 'excluded' && i.image_review !== 'approved' && i.candidates.length > 1 ? (
                <View style={styles.badges}>
                  {i.candidates.filter((c) => c.pinId !== target).map((c) => (
                    <TouchableOpacity
                      key={c.pinId}
                      onPress={() => patch(i.id, { action: 'set_pin', pinId: c.pinId })}
                      style={[styles.chip, { borderColor: colors.homeLine, flexDirection: 'row', alignItems: 'center' }]}
                    >
                      {data.pinAndPop?.[c.pinId]?.imageUrl ? (
                        <Image source={{ uri: data.pinAndPop[c.pinId].imageUrl! }} style={styles.chipThumb} resizeMode="contain" referrerPolicy="no-referrer" accessibilityLabel={`Pin & Pop reference for ${c.title}`} />
                      ) : null}
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

              <View style={styles.actions}>
                {i.decision === 'excluded' ? btn(`${i.id}:reset`, 'Restore', () => patch(i.id, { action: 'reset' })) : i.image_review === 'approved' ? null : (
                  <>
                    {i.decision === 'undecided' && i.suggested_pin_id
                      ? i.match_status === 'unmatched'
                        ? btn(`${i.id}:confirm`, 'Use best guess', () => patch(i.id, { action: 'confirm' }))
                        : btn(`${i.id}:confirm`, 'Confirm match', () => patch(i.id, { action: 'confirm' }), 'primary')
                      : null}
                    {btn(`${i.id}:search`, target ? 'Change pin' : 'Choose pin', () => setSearchFor({ itemId: i.id }))}
                    {scan.permission_public_display && i.cleanup_status !== 'done' && target && data.config.pixianConfigured
                      ? btn(`${i.id}:clean`, 'Clean photo', () => clean(i.id)) : null}
                    {i.cleanup_status === 'done' && i.image_review === 'none' ? (
                      <>
                        {btn(`${i.id}:approve`, 'Approve photo', () => approve(i.id), 'primary')}
                        {btn(`${i.id}:rotate`, 'Straighten', () => rotate(i.id, 'auto'))}
                        {btn(`${i.id}:rotate`, '↺ Turn left', () => rotate(i.id, -3))}
                        {btn(`${i.id}:rotate`, '↻ Turn right', () => rotate(i.id, 3))}
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
        scanId={id}
        item={searchFor && 'itemId' in searchFor
          ? (() => { const it = data?.items.find((x) => x.id === searchFor.itemId); return it ? { id: it.id, position: it.position, cropUrl: it.cropUrl } : null; })()
          : null}
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
      <ZoomModal picture={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

const share = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

/** The last accuracy check: how often matching agreed with the reviewer, and where it didn't. */
function AccuracyPanel(props: { report: AccuracyReport; items: Item[]; running: boolean }) {
  const colors = useColors();
  const r = props.report;
  const crop = (itemId: string) => props.items.find((i) => i.id === itemId)?.cropUrl ?? null;
  return (
    <View style={[styles.accuracy, { borderColor: colors.homeLine }]}>
      <Text style={[styles.small, { color: colors.homeInk }]}>
        <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Accuracy check</Text>
        {` · ${new Date(r.at).toLocaleString(localeFor())}${props.running ? ' · running again…' : ''}`}
      </Text>
      <Text style={[styles.match, { color: colors.homeInk }]}>
        Right first time: {r.top1} of {r.checked} ({share(r.top1, r.checked)}) · In the top 5: {r.top5} of {r.checked} ({share(r.top5, r.checked)})
      </Text>
      {r.errors > 0 ? <Text style={[styles.tiny, { color: colors.homeMuted }]}>{r.errors} pin{r.errors === 1 ? '' : 's'} couldn't be checked.</Text> : null}
      {r.misses.map((m) => (
        <View key={m.itemId} style={styles.missRow}>
          {crop(m.itemId) ? <Image source={{ uri: crop(m.itemId)! }} style={styles.missImg} resizeMode="contain" /> : <View style={[styles.missImg, { backgroundColor: colors.homeAqua }]} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: colors.homeInk }]}>
              #{m.position}: should be {m.expected.title ?? m.expected.pinId} <Text style={{ color: colors.homeMuted }}>· {m.expected.pinId}</Text>
            </Text>
            <Text style={[styles.tiny, { color: colors.homeMuted }]}>
              {m.got ? `Matching picked ${m.got.title} (${m.got.confidence}%)` : 'Matching found nothing'}
              {' · '}{m.rank ? `the right pin was #${m.rank}` : 'the right pin wasn\'t in the top 5'}
            </Text>
          </View>
        </View>
      ))}
      {r.misses.length === 0 && r.checked > 0 ? <Text style={[styles.tiny, { color: '#2E8B57' }]}>Every checked pin was matched right first time.</Text> : null}
    </View>
  );
}

/** One picture full size, e.g. to compare a crop with its Pin & Pop reference. */
function ZoomModal(props: { picture: { uri: string; label: string; reference?: boolean } | null; onClose: () => void }) {
  return (
    <Modal visible={!!props.picture} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.zoomBackdrop} onPress={props.onClose} accessibilityLabel="Close the picture">
        {props.picture ? (
          <>
            <Image
              source={{ uri: props.picture.uri }}
              style={[styles.zoomImg, { backgroundColor: '#fff' }]}
              resizeMode="contain"
              {...(props.picture.reference ? { referrerPolicy: 'no-referrer' as const } : {})}
            />
            <Text style={[styles.small, { color: '#fff', textAlign: 'center' }]}>{props.picture.label}</Text>
            <Text style={[styles.tiny, { color: '#ddd', textAlign: 'center' }]}>Tap anywhere to close</Text>
          </>
        ) : null}
      </Pressable>
    </Modal>
  );
}

/** Tiles 3 across when each can be at least ~95 px wide, else 2; tiles fill the row (8 px gaps). */
export function pickGrid(width: number): { cols: 2 | 3; tileWidth: number } {
  const cols = width >= 300 ? 3 : 2;
  return { cols, tileWidth: Math.floor((width - 8 * (cols - 1)) / cols) };
}

/**
 * "Which pin is it?" — for corrections and hand-added pins. For a pin on the
 * board it opens with its crop to compare against, the catalogue pins that
 * look most like it (picture index) and the board's sets to browse as
 * picture grids; search narrows within the chosen set or the whole
 * catalogue. Long-press (or the corner button on) a picture to enlarge it.
 */
function PinSearchModal(props: {
  visible: boolean;
  onClose: () => void;
  apiBase: string;
  token: string | undefined;
  allowAuto: boolean;
  scanId?: string;
  item?: { id: string; position: number; cropUrl: string | null } | null;
  onPick: (pinId: string | null) => void;
}) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const [set, setSet] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [more, setMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sets, setSets] = useState<string[]>([]);
  const [lookalikes, setLookalikes] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  // Tiles fill the row: 3 across where there's room, else 2 (no empty column).
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth > 0 ? pickGrid(gridWidth).tileWidth : undefined;
  const itemId = props.item?.id;

  useEffect(() => {
    if (!props.visible) {
      setQ(''); setSet(null); setResults([]); setMore(false); setSearched(false);
      setSets([]); setLookalikes([]); setErr(null); setPreview(null);
    }
  }, [props.visible]);

  // Starting points for a pin on the board: its sets and its look-alikes.
  useEffect(() => {
    if (!props.visible || !itemId || !props.scanId || !props.token) return;
    let cancelled = false;
    fetch(`${props.apiBase}/admin/board-scans/${props.scanId}/items/${itemId}/picks`, { headers: { Authorization: `Bearer ${props.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setSets(Array.isArray(body.sets) ? body.sets : []);
        setLookalikes(Array.isArray(body.lookalikes) ? body.lookalikes : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [props.visible, itemId, props.scanId, props.apiBase, props.token]);

  const run = useCallback(async (opts: { set?: string | null; append?: boolean } = {}) => {
    const inSet = opts.set !== undefined ? opts.set : set;
    if (!props.token || (!inSet && q.trim().length < 2)) return;
    setLoading(true);
    setErr(null);
    try {
      const offset = opts.append ? results.length : 0;
      const params = new URLSearchParams({ q: q.trim(), offset: String(offset) });
      if (inSet) params.set('set', inSet);
      const res = await fetch(`${props.apiBase}/admin/board-scans-pin-search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${props.token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Search failed');
      setResults(opts.append ? [...results, ...body.pins] : body.pins);
      setMore(body.more === true);
      setSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q, set, results, props.apiBase, props.token]);

  const chooseSet = (name: string | null) => {
    setSet(name);
    setResults([]);
    setSearched(false);
    if (name) void run({ set: name });
  };

  const tile = (p: SearchResult) => {
    const picture = p.imageUrl ?? p.referenceUrl ?? null;
    return (
      <Pressable
        key={p.pinId}
        onPress={() => props.onPick(p.pinId)}
        onLongPress={() => picture && setPreview(p)}
        style={[styles.tile, { borderColor: colors.homeLine }, tileWidth ? { width: tileWidth } : null]}
        accessibilityLabel={`Choose ${p.title}`}
      >
        {picture ? (
          <Image
            source={{ uri: picture }}
            style={[styles.tileImg, { backgroundColor: '#fff' }]}
            resizeMode="contain"
            {...(!p.imageUrl ? { referrerPolicy: 'no-referrer' as const } : {})}
            accessibilityLabel={!p.imageUrl ? `Pin & Pop reference for ${p.title}` : p.title}
          />
        ) : (
          <View style={[styles.tileImg, { backgroundColor: colors.homeAqua }]} />
        )}
        {picture ? (
          <TouchableOpacity onPress={() => setPreview(p)} style={styles.tileZoom} accessibilityLabel={`Enlarge ${p.title}`}>
            <Feather name="maximize-2" size={12} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.tiny, { color: colors.homeInk }]} numberOfLines={2}>{p.title}</Text>
        <Text style={[styles.tiny, { color: colors.homeMuted }]} numberOfLines={1}>{p.pinId}</Text>
      </Pressable>
    );
  };

  const showLookalikes = lookalikes.length > 0 && !set && !searched;

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modal, { backgroundColor: colors.homeSurface }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.itemTitle, { color: colors.homeInk }]}>Which pin is it?</Text>
            <TouchableOpacity onPress={props.onClose} accessibilityLabel="Close"><Feather name="x" size={20} color={colors.homeMuted} /></TouchableOpacity>
          </View>
          {props.item?.cropUrl ? (
            <View style={styles.cropRow}>
              <Image source={{ uri: props.item.cropUrl }} style={styles.cropImg} resizeMode="contain" accessibilityLabel="Your pin" />
              <Text style={[styles.small, { color: colors.homeMuted, flex: 1 }]}>
                Pin #{props.item.position} on the board. Tap a picture to choose it; hold (or ⤢) to enlarge.
              </Text>
            </View>
          ) : null}
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, minWidth: 0, borderColor: colors.homeLine, color: colors.homeInk }]}
              placeholder={set ? `Search in ${set}` : 'Title, character, set or PHUK-…'}
              placeholderTextColor={colors.homeMuted}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => run()}
              autoFocus={!props.item}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => run()} style={[styles.btn, { borderColor: colors.homeCoral }]} accessibilityLabel="Search">
              {loading ? <ActivityIndicator size="small" color={colors.homeCoral} /> : <Feather name="search" size={16} color={colors.homeCoral} />}
            </TouchableOpacity>
          </View>
          {sets.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6 }}>
              {[null, ...sets].map((name) => (
                <TouchableOpacity
                  key={name ?? '__all'}
                  onPress={() => chooseSet(name)}
                  style={[styles.chip, { borderColor: colors.homeLine, backgroundColor: set === name ? colors.homeAqua : 'transparent' }]}
                >
                  <Text style={[styles.chipText, { color: colors.homeInk }]} numberOfLines={1}>{name ?? 'Whole catalogue'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
          {props.allowAuto ? (
            <TouchableOpacity onPress={() => props.onPick(null)} style={[styles.btn, { borderColor: colors.homeCoral, alignSelf: 'flex-start' }]}>
              <Text style={[styles.btnText, { color: colors.homeCoral }]}>Don't know — match it automatically</Text>
            </TouchableOpacity>
          ) : null}
          {err ? <Text style={[styles.small, { color: colors.destructive }]}>{err}</Text> : null}
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8 }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {showLookalikes ? (
              <>
                <Text style={[styles.small, { color: colors.homeInk }]}>Looks like your pin</Text>
                <View style={styles.grid}>{lookalikes.map(tile)}</View>
              </>
            ) : null}
            {results.length > 0 ? <View style={styles.grid}>{results.map(tile)}</View> : null}
            {searched && results.length === 0 && !loading ? (
              <Text style={[styles.small, { color: colors.homeMuted }]}>No pins found{set ? ` in ${set}` : ''}.</Text>
            ) : null}
            {more ? (
              <TouchableOpacity onPress={() => run({ append: true })} style={[styles.btn, { borderColor: colors.homeCoral, alignSelf: 'center' }]}>
                <Text style={[styles.btnText, { color: colors.homeCoral }]}>{loading ? 'Loading…' : 'Show more'}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
          {preview ? (
            <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)} accessibilityLabel="Close the picture">
              <Image
                source={{ uri: (preview.imageUrl ?? preview.referenceUrl)! }}
                style={[styles.previewImg, { backgroundColor: '#fff' }]}
                resizeMode="contain"
                {...(!preview.imageUrl ? { referrerPolicy: 'no-referrer' as const } : {})}
              />
              <Text style={[styles.small, { color: '#fff', textAlign: 'center' }]}>
                {preview.title} · {preview.pinId}{!preview.imageUrl ? ' · Pin & Pop (admin only)' : ''}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => props.onPick(preview.pinId)} style={[styles.btn, { borderColor: '#fff', backgroundColor: colors.homeCoral }]}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>Choose this pin</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPreview(null)} style={[styles.btn, { borderColor: '#fff' }]}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>Back</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          ) : null}
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
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 6, backgroundColor: '#0001' },
  chipThumb: { width: 28, height: 28, borderRadius: 4, marginRight: 6, backgroundColor: '#fff' },
  match: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 },
  modal: { borderRadius: 14, padding: 16, gap: 10, maxWidth: 560, width: '100%', maxHeight: '100%', alignSelf: 'center' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontFamily: 'Inter_400Regular' },
  result: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 6 },
  resultImg: { width: 64, height: 64, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', borderWidth: 1, borderRadius: 8, padding: 4, gap: 2 },
  tileImg: { width: '100%', aspectRatio: 1, borderRadius: 4 },
  tileZoom: { position: 'absolute', top: 6, right: 6, backgroundColor: '#0008', borderRadius: 10, padding: 4 },
  cropRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cropImg: { width: 80, height: 80, borderRadius: 6, backgroundColor: '#0001' },
  previewOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000c', borderRadius: 14, padding: 16, gap: 10, alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: 360, borderRadius: 8 },
  accuracy: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  missRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  missImg: { width: 48, height: 48, borderRadius: 4, backgroundColor: '#0001' },
  zoomBackdrop: { flex: 1, backgroundColor: '#000d', padding: 16, gap: 10, alignItems: 'center', justifyContent: 'center' },
  zoomImg: { width: '100%', maxWidth: 720, height: '75%', borderRadius: 8 },
});
