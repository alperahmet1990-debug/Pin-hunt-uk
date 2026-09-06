/**
 * Admin — eBay Image Dry Run report. Developer tooling — not linked from
 * the normal Admin navigation; still reachable directly by URL.
 *
 * Starts a 50-pin search (server side) and shows the resulting report:
 * per-pin best eBay listing candidate, match score, classification, and
 * reasons. Running the search itself does not change anything, but the
 * "Use this image for the pin" action on a result DOES write that image to
 * the live pin once you confirm the dialog — this screen is a review tool
 * with a real write action, not a read-only report.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

import { API_BASE } from '@/lib/apiBase';

// ─── Types (mirror api-server dry-run service) ───────────────────────────────

type Classification = 'high_confidence' | 'provisional' | 'review_required' | 'no_match' | 'error';

interface RunSummary {
  id: string;
  started_at: string;
  completed_at: string | null;
  pins_examined: number;
  high_confidence_count: number;
  provisional_count: number;
  review_required_count: number;
  no_match_count: number;
  error_count: number;
  status: 'running' | 'completed' | 'failed';
}

interface DryRunResult {
  id: string;
  pinhunt_id: string;
  pin_name: string;
  pin_metadata: Record<string, unknown>;
  queries_used: string[];
  best_ebay_item_id: string | null;
  marketplace: string | null;
  listing_title: string | null;
  listing_url: string | null;
  image_url: string | null;
  match_score: number | null;
  confidence_classification: Classification;
  match_reasons: string[];
  rejection_reasons: string[];
  would_assign: boolean;
  applied_at: string | null;
}

const CLASS_META: Record<Classification, { label: string; color: string }> = {
  high_confidence: { label: 'High confidence', color: '#16a34a' },
  provisional: { label: 'Provisional', color: '#2563eb' },
  review_required: { label: 'Review required', color: '#d97706' },
  no_match: { label: 'No match', color: '#6b7280' },
  error: { label: 'Error', color: '#dc2626' },
};

const FILTERS: Array<{ key: Classification | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'high_confidence', label: 'High' },
  { key: 'provisional', label: 'Provisional' },
  { key: 'review_required', label: 'Review' },
  { key: 'no_match', label: 'No match' },
  { key: 'error', label: 'Error' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EbayImageDryRunScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [results, setResults] = useState<DryRunResult[]>([]);
  const [filter, setFilter] = useState<Classification | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  );

  const loadRun = useCallback(async (runId: string) => {
    const resp = await fetch(`${API_BASE}/catalogue/ebay-image-dry-run/runs/${runId}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) throw new Error(`Failed to load run (HTTP ${resp.status})`);
    const data = (await resp.json()) as { summary: RunSummary; results: DryRunResult[] };
    setSummary(data.summary);
    setResults(data.results);
    return data.summary;
  }, [authHeaders]);

  const loadLatest = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/ebay-image-dry-run/runs`, {
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error(`Failed to load runs (HTTP ${resp.status})`);
      const data = (await resp.json()) as { runs: RunSummary[] };
      if (data.runs.length > 0) await loadRun(data.runs[0].id);
      else { setSummary(null); setResults([]); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadRun]);

  useEffect(() => { if (token) loadLatest(); }, [token, loadLatest]);

  // Poll while a run is in progress.
  useEffect(() => {
    if (summary?.status === 'running' && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const s = await loadRun(summary.id);
          if (s.status !== 'running' && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch { /* keep polling */ }
      }, 5000);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [summary?.status, summary?.id, loadRun]);

  const startRun = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/ebay-image-dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = (await resp.json()) as { runId?: string; error?: string };
      if (!resp.ok || !data.runId) throw new Error(data.error ?? `HTTP ${resp.status}`);
      await loadRun(data.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start dry run');
    } finally {
      setStarting(false);
    }
  }, [authHeaders, loadRun]);

  const applyImage = useCallback((result: DryRunResult) => {
    Alert.alert(
      'Use this image?',
      `This sets the eBay listing photo as the live catalogue image for "${result.pin_name}". It can be replaced later with an official photo.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setApplyingId(result.id);
            try {
              const resp = await fetch(
                `${API_BASE}/catalogue/ebay-image-dry-run/results/${result.id}/apply`,
                { method: 'POST', headers: authHeaders() },
              );
              const text = await resp.text();
              let data: any;
              try { data = JSON.parse(text); } catch {
                throw new Error('The server was interrupted — please try again.');
              }
              if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
              setResults(prev =>
                prev.map(r => (r.id === result.id ? { ...r, applied_at: new Date().toISOString() } : r)),
              );
            } catch (e) {
              Alert.alert('Could not apply image', e instanceof Error ? e.message : 'Unknown error');
            } finally {
              setApplyingId(null);
            }
          },
        },
      ],
    );
  }, [authHeaders]);

  const retrySearch = useCallback(async (result: DryRunResult) => {
    setRetryingId(result.id);
    try {
      const resp = await fetch(
        `${API_BASE}/catalogue/ebay-image-dry-run/results/${result.id}/retry`,
        { method: 'POST', headers: authHeaders() },
      );
      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        throw new Error('The server was interrupted — please try again.');
      }
      if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
      const updated = data.result as Partial<DryRunResult>;
      setResults(prev => prev.map(r => (r.id === result.id ? { ...r, ...updated } : r)));
      if (!updated.image_url) {
        Alert.alert('No other image found', 'eBay has no other listing that matches this pin well enough right now.');
      }
    } catch (e) {
      Alert.alert('Could not search again', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRetryingId(null);
    }
  }, [authHeaders]);

  const filtered = filter === 'all'
    ? results
    : results.filter(r => r.confidence_classification === filter);

  const autoCoverage = summary && summary.pins_examined > 0
    ? Math.round(((summary.high_confidence_count + summary.provisional_count) / summary.pins_examined) * 100)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'eBay Image Dry Run' }} />
      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLatest} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <Text style={[styles.intro, { color: colors.mutedForeground }]}>
              Finds candidate eBay images for pins with no photo. Running this
              search doesn't change anything — but choosing "Use this image"
              on a result writes that image to the live pin.
            </Text>
            {error ? <Text style={[styles.error, { color: '#dc2626' }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.primary, opacity: starting || summary?.status === 'running' ? 0.6 : 1 }]}
              disabled={starting || summary?.status === 'running'}
              onPress={startRun}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.startBtnText}>
                  {summary?.status === 'running' ? 'Run in progress…' : 'Start 50-pin dry run'}
                </Text>
              )}
            </TouchableOpacity>

            {summary && (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.summaryHeader}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>
                    {summary.status === 'running'
                      ? `Running — ${summary.pins_examined} pins done`
                      : summary.status === 'failed'
                        ? 'Run failed'
                        : `${summary.pins_examined} pins examined`}
                  </Text>
                  {summary.status === 'running' && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                <SummaryRow label="High confidence" value={summary.high_confidence_count} color={CLASS_META.high_confidence.color} colors={colors} />
                <SummaryRow label="Provisional" value={summary.provisional_count} color={CLASS_META.provisional.color} colors={colors} />
                <SummaryRow label="Review required" value={summary.review_required_count} color={CLASS_META.review_required.color} colors={colors} />
                <SummaryRow label="No reliable match" value={summary.no_match_count} color={CLASS_META.no_match.color} colors={colors} />
                <SummaryRow label="Errors" value={summary.error_count} color={CLASS_META.error.color} colors={colors} />
                <Text style={[styles.coverage, { color: colors.text }]}>
                  Estimated automatic coverage: {autoCoverage}%
                </Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {FILTERS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: filter === f.key ? colors.primary : colors.card,
                      borderColor: filter === f.key ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={{ color: filter === f.key ? '#fff' : colors.text, fontSize: 13 }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {summary ? 'No results in this filter.' : 'No dry run has been started yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ResultCard
            result={item}
            colors={colors}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onViewImage={() => item.image_url && setViewerUrl(item.image_url)}
            onApply={() => applyImage(item)}
            applying={applyingId === item.id}
            onRetry={() => retrySearch(item)}
            retrying={retryingId === item.id}
          />
        )}
      />

      {/* Full-screen image viewer */}
      <Modal visible={viewerUrl != null} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />}
          <View style={styles.viewerClose}>
            <Feather name="x" size={22} color="#fff" />
            <Text style={styles.viewerCloseText}>Tap anywhere to close</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function SummaryRow({ label, value, color, colors }: { label: string; value: number; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ResultCard({ result, colors, expanded, onToggle, onViewImage, onApply, applying, onRetry, retrying }: {
  result: DryRunResult;
  colors: ReturnType<typeof useColors>;
  expanded: boolean;
  onToggle: () => void;
  onViewImage: () => void;
  onApply: () => void;
  applying: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  const meta = CLASS_META[result.confidence_classification];
  const md = result.pin_metadata ?? {};
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.cardRow}>
        {result.image_url ? (
          <TouchableOpacity onPress={onViewImage} activeOpacity={0.8}>
            <Image source={{ uri: result.image_url }} style={styles.thumb} resizeMode="contain" />
            <View style={styles.zoomHint}>
              <Feather name="maximize-2" size={10} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.background }]}>
            <Feather name="image" size={20} color={colors.mutedForeground} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.pinName, { color: colors.text }]} numberOfLines={2}>{result.pin_name}</Text>
          <Text style={[styles.pinId, { color: colors.mutedForeground }]}>{result.pinhunt_id}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {result.match_score != null && (
              <Text style={[styles.score, { color: colors.text }]}>{result.match_score}/100</Text>
            )}
            {result.applied_at ? (
              <View style={[styles.badge, { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}>
                <Text style={[styles.badgeText, { color: '#fff' }]}>Applied</Text>
              </View>
            ) : result.would_assign ? (
              <View style={[styles.badge, { backgroundColor: '#16a34a18', borderColor: '#16a34a40' }]}>
                <Text style={[styles.badgeText, { color: '#16a34a' }]}>Would assign</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </View>

      {expanded && (
        <View style={[styles.detail, { borderTopColor: colors.border }]}>
          <DetailLine label="Metadata" value={[
            md.brand, md.collection,
            Array.isArray(md.characters) && md.characters.length ? (md.characters as string[]).join(', ') : null,
            md.limitedEditionSize ? `LE ${md.limitedEditionSize}` : null,
            md.releaseYear ? String(md.releaseYear) : null,
          ].filter(Boolean).join(' · ') || '—'} colors={colors} />
          <DetailLine label="Queries" value={(result.queries_used ?? []).join('\n') || '—'} colors={colors} />
          {result.listing_title && <DetailLine label="Best listing" value={result.listing_title} colors={colors} />}
          {result.marketplace && <DetailLine label="Marketplace" value={result.marketplace === 'EBAY_GB' ? 'eBay UK' : 'eBay US'} colors={colors} />}
          {(result.match_reasons ?? []).length > 0 && (
            <DetailLine label="Match reasons" value={result.match_reasons.join('\n')} colors={colors} />
          )}
          {(result.rejection_reasons ?? []).length > 0 && (
            <DetailLine label="Warnings / rejections" value={result.rejection_reasons.join('\n')} colors={colors} />
          )}
          {result.listing_url && (
            <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(result.listing_url!)}>
              <Feather name="external-link" size={14} color={colors.primary} />
              <Text style={[styles.linkText, { color: colors.primary }]}>View listing on eBay</Text>
            </TouchableOpacity>
          )}
          {result.image_url && !result.applied_at && (
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: colors.primary, opacity: applying ? 0.6 : 1 }]}
              disabled={applying}
              onPress={onApply}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="check-circle" size={15} color="#fff" />
              )}
              <Text style={styles.applyBtnText}>Use this image for the pin</Text>
            </TouchableOpacity>
          )}
          {!result.applied_at && (
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: retrying ? 0.6 : 1 }]}
              disabled={retrying}
              onPress={onRetry}
            >
              {retrying ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="refresh-cw" size={15} color={colors.primary} />
              )}
              <Text style={[styles.applyBtnText, { color: colors.primary }]}>
                {retrying ? 'Searching eBay…' : 'Find a different image'}
              </Text>
            </TouchableOpacity>
          )}
          {result.applied_at && (
            <Text style={[styles.detailValue, { color: '#16a34a', marginTop: 4 }]}>
              ✓ Applied as the live catalogue image
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailLine({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  error: { fontSize: 13, marginBottom: 8 },
  startBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  startBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  summaryTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  summaryLabel: { flex: 1, fontSize: 13 },
  summaryValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  coverage: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#fff' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  pinName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  pinId: { fontSize: 11, marginTop: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  score: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  detail: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  detailLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  detailValue: { fontSize: 13, lineHeight: 18 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  zoomHint: { position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 3 },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  applyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '94%', height: '75%' },
  viewerClose: { position: 'absolute', bottom: 48, alignItems: 'center', gap: 6 },
  viewerCloseText: { color: '#fff', fontSize: 13 },
});
