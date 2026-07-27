/**
 * Admin — Catalogue Validation.
 *
 * Checks catalogue records against current eBay listings and shows the
 * evidence side by side: existing record on top, best eBay candidates below.
 * Every finding is a suggestion — nothing changes until an admin approves,
 * and prices shown are current eBay asking prices, never sold prices.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

// ─── Types (mirror api-server catalogue-validation service) ──────────────────

type ValidationStatus =
  | 'strong_match' | 'probable_match' | 'needs_review'
  | 'no_match' | 'insufficient_data' | 'error';

interface RunSummary {
  id: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  filter_collection: string | null;
  started_at: string;
  completed_at: string | null;
  pins_checked: number;
  strong_match_count: number;
  probable_match_count: number;
  needs_review_count: number;
  no_match_count: number;
  insufficient_data_count: number;
  suspected_error_count: number;
  suspected_duplicate_count: number;
  api_calls_used: number;
  api_error_count: number;
}

interface Candidate {
  itemId: string;
  marketplace: string;
  title: string;
  url: string | null;
  imageUrl: string | null;
  askingPrice: number | null;
  currency: string | null;
  sellerLocation: string | null;
  score: number;
  reasons: string[];
  penalties: string[];
}

interface ValidationFlag { code: string; message: string }

interface ValidationResult {
  id: string;
  pin_id: string;
  pinhunt_id: string;
  validation_status: ValidationStatus;
  confidence_score: number | null;
  match_count: number;
  best_ebay_url: string | null;
  suggested_year: number | null;
  suggested_edition_size: number | null;
  suggested_edition_type: string | null;
  suspected_duplicate_pin_id: string | null;
  validation_notes: string | null;
  validation_flags: ValidationFlag[];
  raw_search_queries: string[];
  raw_candidate_results: Candidate[];
  pin_snapshot: {
    title?: string; brand?: string; collection?: string; characters?: string[];
    releaseYear?: number | null; limitedEditionSize?: number | null;
    editionType?: string | null; origin?: string | null; imageUrl?: string | null;
  };
  admin_status: 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'unable_to_verify' | 'keep_both';
}

const STATUS_META: Record<ValidationStatus, { label: string; color: string }> = {
  strong_match: { label: 'Strong match', color: '#16a34a' },
  probable_match: { label: 'Probable match', color: '#2563eb' },
  needs_review: { label: 'Needs review', color: '#d97706' },
  no_match: { label: 'No reliable match', color: '#6b7280' },
  insufficient_data: { label: 'Insufficient data', color: '#9333ea' },
  error: { label: 'Error', color: '#dc2626' },
};

const FILTERS: Array<{ key: ValidationStatus | 'all' | 'flagged'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'flagged', label: 'Suspected errors' },
  { key: 'strong_match', label: 'Strong' },
  { key: 'probable_match', label: 'Probable' },
  { key: 'needs_review', label: 'Review' },
  { key: 'no_match', label: 'No match' },
  { key: 'insufficient_data', label: 'Vague' },
  { key: 'error', label: 'Errors' },
];

const SUGGESTION_FIELDS: Array<{ key: string; label: string; get: (r: ValidationResult) => string | number | null }> = [
  { key: 'year', label: 'Release year', get: r => r.suggested_year },
  { key: 'edition_size', label: 'Edition size', get: r => r.suggested_edition_size },
  { key: 'edition_type', label: 'Edition type', get: r => r.suggested_edition_type },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CatalogueValidationScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [filter, setFilter] = useState<ValidationStatus | 'all' | 'flagged'>('all');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Optional series scope for the next run.
  const [seriesQuery, setSeriesQuery] = useState('');
  const [seriesChosen, setSeriesChosen] = useState<string | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  // Field-approval picker state (per expanded record).
  const [pickedFields, setPickedFields] = useState<Record<string, Set<string>>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  );

  const loadRun = useCallback(async (runId: string) => {
    const resp = await fetch(`${API_BASE}/catalogue/validation/runs/${runId}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error(`Failed to load run (HTTP ${resp.status})`);
    const data = (await resp.json()) as { summary: RunSummary; results: ValidationResult[] };
    setSummary(data.summary);
    setResults(data.results);
    return data.summary;
  }, [authHeaders]);

  const loadLatest = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation/runs`, { headers: authHeaders() });
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

  // Series autocomplete (existing catalogue distinct-values endpoint).
  useEffect(() => {
    if (!token || seriesChosen || seriesQuery.trim().length < 2) { setSeriesOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(
          `${API_BASE}/admin/catalogue/distinct?field=collection&search=${encodeURIComponent(seriesQuery.trim())}&limit=8`,
          { headers: authHeaders() },
        );
        if (resp.ok) {
          const data = (await resp.json()) as { values: string[] };
          setSeriesOptions(data.values ?? []);
        }
      } catch { /* suggestions are best-effort */ }
    }, 300);
    return () => clearTimeout(t);
  }, [seriesQuery, seriesChosen, token, authHeaders]);

  const startRun = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ limit: 50, ...(seriesChosen ? { collection: seriesChosen } : {}) }),
      });
      const data = (await resp.json()) as { runId?: string; error?: string };
      if (!resp.ok || !data.runId) throw new Error(data.error ?? `HTTP ${resp.status}`);
      await loadRun(data.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start validation');
    } finally {
      setStarting(false);
    }
  }, [authHeaders, loadRun, seriesChosen]);

  const sendDecision = useCallback(async (
    result: ValidationResult,
    action: string,
    fields?: string[],
  ) => {
    setBusyId(result.id);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation/results/${result.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action, fields }),
      });
      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error('The server was interrupted — please try again.'); }
      if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
      const admin_status =
        action === 'reject' || action === 'keep_both' ? 'rejected'
        : action === 'unable_to_verify' ? 'unable_to_verify'
        : fields && fields.length < availableSuggestions(result).length ? 'partially_approved'
        : 'approved';
      setResults(prev => prev.map(r => (r.id === result.id ? { ...r, admin_status: admin_status as ValidationResult['admin_status'] } : r)));
    } catch (e) {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  }, [authHeaders]);

  const confirmApprove = useCallback((result: ValidationResult, fields: string[]) => {
    const lines = fields.map(f => {
      const def = SUGGESTION_FIELDS.find(s => s.key === f);
      const snap = result.pin_snapshot;
      const current = f === 'year' ? snap.releaseYear
        : f === 'edition_size' ? snap.limitedEditionSize
        : f === 'edition_type' ? snap.editionType : null;
      return `${def?.label}: ${current ?? '—'} → ${def?.get(result) ?? '—'}`;
    });
    Alert.alert(
      'Apply these changes?',
      `The catalogue record will change:\n\n${lines.join('\n')}\n\nEvery change is logged and reversible.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', onPress: () => sendDecision(result, 'approve_fields', fields) },
      ],
    );
  }, [sendDecision]);

  const revalidate = useCallback(async (result: ValidationResult) => {
    setBusyId(result.id);
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation/results/${result.id}/revalidate`, {
        method: 'POST', headers: authHeaders(),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as any)?.error ?? `HTTP ${resp.status}`);
      }
      if (summary) await loadRun(summary.id);
    } catch (e) {
      Alert.alert('Re-run failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  }, [authHeaders, summary, loadRun]);

  const pauseRun = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation/pause`, { method: 'POST', headers: authHeaders() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (summary) await loadRun(summary.id);
    } catch (e) {
      Alert.alert('Could not pause', e instanceof Error ? e.message : 'Unknown error');
    }
  }, [authHeaders, summary, loadRun]);

  const exportCsv = useCallback(async () => {
    if (!summary) return;
    try {
      const resp = await fetch(`${API_BASE}/catalogue/validation/runs/${summary.id}/csv`, { headers: authHeaders() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const csv = await resp.text();
      const filename = `catalogue-validation-${summary.id.slice(0, 8)}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new FileSystem.File(FileSystem.Paths.cache, filename);
        file.write(csv);
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, [authHeaders, summary]);

  const filtered = filter === 'all'
    ? results
    : filter === 'flagged'
      ? results.filter(r => (r.validation_flags ?? []).some(f =>
          ['edition_size_conflict', 'year_conflict', 'character_mismatch', 'maybe_set', 'possible_duplicate', 'missing_edition_size'].includes(f.code)))
      : results.filter(r => r.validation_status === filter);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Catalogue Validation' }} />
      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLatest} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <Text style={[styles.intro, { color: colors.mutedForeground }]}>
              Checks catalogue records against current eBay listings and flags likely
              spreadsheet errors. All findings are suggestions — nothing changes until
              you approve it. Prices shown are current eBay asking prices, not values.
            </Text>
            {error ? <Text style={[styles.error, { color: '#dc2626' }]}>{error}</Text> : null}

            {/* Optional series scope */}
            <View style={[styles.seriesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.seriesLabel, { color: colors.mutedForeground }]}>Limit to a series (optional)</Text>
              {seriesChosen ? (
                <View style={styles.seriesChosenRow}>
                  <View style={[styles.badge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                    <Text style={[styles.badgeText, { color: colors.primary }]}>{seriesChosen}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSeriesChosen(null); setSeriesQuery(''); }}>
                    <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[styles.seriesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Start typing a series name…"
                    placeholderTextColor={colors.mutedForeground}
                    value={seriesQuery}
                    onChangeText={setSeriesQuery}
                  />
                  {seriesOptions.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.seriesOption, { borderColor: colors.border }]}
                      onPress={() => { setSeriesChosen(opt); setSeriesOptions([]); }}
                    >
                      <Feather name="tag" size={13} color={colors.primary} />
                      <Text style={[styles.seriesOptionText, { color: colors.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.primary, opacity: starting || summary?.status === 'running' ? 0.6 : 1 }]}
              disabled={starting || summary?.status === 'running'}
              onPress={startRun}
            >
              {starting ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.startBtnText}>
                  {summary?.status === 'running'
                    ? 'Validation in progress…'
                    : seriesChosen
                      ? `Validate "${seriesChosen}" pins`
                      : 'Validate next 50 pins'}
                </Text>
              )}
            </TouchableOpacity>

            {summary && (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.summaryHeader}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>
                    {summary.status === 'running'
                      ? `Running — ${summary.pins_checked} pins checked`
                      : summary.status === 'failed' ? 'Run failed'
                      : summary.status === 'paused' ? `Paused at ${summary.pins_checked} pins`
                      : `${summary.pins_checked} pins checked`}
                    {summary.filter_collection ? ` — ${summary.filter_collection}` : ''}
                  </Text>
                  {summary.status === 'running' && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                <SummaryRow label="Strong matches" value={summary.strong_match_count} color={STATUS_META.strong_match.color} colors={colors} />
                <SummaryRow label="Probable matches" value={summary.probable_match_count} color={STATUS_META.probable_match.color} colors={colors} />
                <SummaryRow label="Needs review" value={summary.needs_review_count} color={STATUS_META.needs_review.color} colors={colors} />
                <SummaryRow label="No reliable match" value={summary.no_match_count} color={STATUS_META.no_match.color} colors={colors} />
                <SummaryRow label="Too vague to check" value={summary.insufficient_data_count} color={STATUS_META.insufficient_data.color} colors={colors} />
                <SummaryRow label="Suspected record errors" value={summary.suspected_error_count} color="#dc2626" colors={colors} />
                <SummaryRow label="Suspected duplicates" value={summary.suspected_duplicate_count} color="#dc2626" colors={colors} />
                <Text style={[styles.apiLine, { color: colors.mutedForeground }]}>
                  {summary.api_calls_used} eBay API calls · {summary.api_error_count} API errors
                </Text>
                <View style={styles.summaryActions}>
                  {summary.status === 'running' && (
                    <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={pauseRun}>
                      <Feather name="pause" size={13} color="#d97706" />
                      <Text style={[styles.smallBtnText, { color: '#d97706' }]}>Pause run</Text>
                    </TouchableOpacity>
                  )}
                  {summary.status !== 'running' && summary.pins_checked > 0 && (
                    <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={exportCsv}>
                      <Feather name="download" size={13} color={colors.primary} />
                      <Text style={[styles.smallBtnText, { color: colors.primary }]}>Export CSV</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {FILTERS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.chip, {
                    backgroundColor: filter === f.key ? colors.primary : colors.card,
                    borderColor: filter === f.key ? colors.primary : colors.border,
                  }]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={{ color: filter === f.key ? '#fff' : colors.text, fontSize: 13 }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {summary ? 'No results in this filter.' : 'No validation run has been started yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ResultCard
            result={item}
            colors={colors}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onViewImage={setViewerUrl}
            busy={busyId === item.id}
            picked={pickedFields[item.id] ?? new Set()}
            onTogglePick={(field) => setPickedFields(prev => {
              const next = new Set(prev[item.id] ?? []);
              if (next.has(field)) next.delete(field); else next.add(field);
              return { ...prev, [item.id]: next };
            })}
            onApprovePicked={(fields) => confirmApprove(item, fields)}
            onDecision={(action) => sendDecision(item, action)}
            onRevalidate={() => revalidate(item)}
            onEdit={() => router.push({ pathname: '/admin/pin/[id]' as any, params: { id: item.pin_id } })}
          />
        )}
      />

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

function availableSuggestions(r: ValidationResult) {
  return SUGGESTION_FIELDS.filter(f => f.get(r) != null && f.get(r) !== '');
}

function SummaryRow({ label, value, color, colors }: { label: string; value: number; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ResultCard({ result, colors, expanded, onToggle, onViewImage, busy, picked, onTogglePick, onApprovePicked, onDecision, onRevalidate, onEdit }: {
  result: ValidationResult;
  colors: ReturnType<typeof useColors>;
  expanded: boolean;
  onToggle: () => void;
  onViewImage: (url: string) => void;
  busy: boolean;
  picked: Set<string>;
  onTogglePick: (field: string) => void;
  onApprovePicked: (fields: string[]) => void;
  onDecision: (action: string) => void;
  onRevalidate: () => void;
  onEdit: () => void;
}) {
  const meta = STATUS_META[result.validation_status];
  const snap = result.pin_snapshot ?? {};
  const suggestions = availableSuggestions(result);
  const flags = result.validation_flags ?? [];
  const reviewed = result.admin_status !== 'pending';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.cardRow}>
        {snap.imageUrl ? (
          <TouchableOpacity onPress={() => onViewImage(snap.imageUrl!)} activeOpacity={0.8}>
            <Image source={{ uri: snap.imageUrl }} style={styles.thumb} resizeMode="contain" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.background }]}>
            <Feather name="image" size={20} color={colors.mutedForeground} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.pinName, { color: colors.text }]} numberOfLines={2}>{snap.title ?? result.pinhunt_id}</Text>
          <Text style={[styles.pinId, { color: colors.mutedForeground }]}>{result.pinhunt_id}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {result.confidence_score != null && (
              <Text style={[styles.score, { color: colors.text }]}>{result.confidence_score}/100</Text>
            )}
            {flags.length > 0 && (
              <View style={[styles.badge, { backgroundColor: '#dc262618', borderColor: '#dc262640' }]}>
                <Text style={[styles.badgeText, { color: '#dc2626' }]}>{flags.length} flag{flags.length > 1 ? 's' : ''}</Text>
              </View>
            )}
            {reviewed && (
              <View style={[styles.badge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                  {result.admin_status.replace(/_/g, ' ')}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </View>

      {expanded && (
        <View style={[styles.detail, { borderTopColor: colors.border }]}>
          {/* Existing record */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Existing record</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {[
              snap.brand, snap.collection,
              (snap.characters ?? []).join(', ') || null,
              snap.limitedEditionSize ? `LE ${snap.limitedEditionSize}` : null,
              snap.editionType, snap.releaseYear ? String(snap.releaseYear) : null,
              snap.origin,
            ].filter(Boolean).join(' · ') || '—'}
          </Text>

          {/* Flags */}
          {flags.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Findings</Text>
              {flags.map((f, i) => (
                <View key={i} style={styles.flagRow}>
                  <Feather name="alert-triangle" size={13} color="#d97706" style={{ marginTop: 2 }} />
                  <Text style={[styles.flagText, { color: colors.text }]}>{f.message}</Text>
                </View>
              ))}
            </>
          )}

          {result.validation_notes && (
            <Text style={[styles.notes, { color: colors.mutedForeground }]}>{result.validation_notes}</Text>
          )}

          {/* eBay candidates */}
          {(result.raw_candidate_results ?? []).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Best eBay candidates</Text>
              {result.raw_candidate_results.map(c => (
                <View key={c.itemId} style={[styles.candidate, { borderColor: colors.border }]}>
                  {c.imageUrl ? (
                    <TouchableOpacity onPress={() => onViewImage(c.imageUrl!)}>
                      <Image source={{ uri: c.imageUrl }} style={styles.candThumb} resizeMode="contain" />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.candThumb, styles.thumbEmpty, { backgroundColor: colors.background }]}>
                      <Feather name="image" size={14} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.candTitle, { color: colors.text }]} numberOfLines={2}>{c.title}</Text>
                    <Text style={[styles.candMeta, { color: colors.mutedForeground }]}>
                      {c.score}/100 · {c.marketplace === 'EBAY_GB' ? 'eBay UK' : 'eBay US'}
                      {c.askingPrice != null ? ` · asking ${c.currency === 'USD' ? '$' : '£'}${c.askingPrice}` : ''}
                      {c.sellerLocation ? ` · ${c.sellerLocation}` : ''}
                    </Text>
                    {c.url && (
                      <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(c.url!)}>
                        <Feather name="external-link" size={12} color={colors.primary} />
                        <Text style={[styles.linkText, { color: colors.primary, fontSize: 12 }]}>Open listing</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                Prices are current eBay asking prices, not sold prices or values.
              </Text>
            </>
          )}

          {/* Suggested corrections with per-field checkboxes */}
          {!reviewed && suggestions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Suggested corrections</Text>
              {suggestions.map(f => {
                const current = f.key === 'year' ? snap.releaseYear
                  : f.key === 'edition_size' ? snap.limitedEditionSize
                  : snap.editionType;
                const checked = picked.has(f.key);
                return (
                  <TouchableOpacity key={f.key} style={styles.fieldRow} onPress={() => onTogglePick(f.key)}>
                    <Feather name={checked ? 'check-square' : 'square'} size={18} color={checked ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.fieldText, { color: colors.text }]}>
                      {f.label}: {current ?? '—'} → {String(f.get(result))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: busy || picked.size === 0 ? 0.5 : 1 }]}
                disabled={busy || picked.size === 0}
                onPress={() => onApprovePicked([...picked])}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check-circle" size={15} color="#fff" />}
                <Text style={styles.actionBtnText}>Apply selected changes</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Decision buttons */}
          <View style={styles.decisionRow}>
            <SmallBtn label="Edit record" icon="edit-2" color={colors.primary} onPress={onEdit} disabled={busy} colors={colors} />
            {!reviewed && (
              <>
                <SmallBtn label="Reject" icon="x" color="#dc2626" onPress={() => onDecision('reject')} disabled={busy} colors={colors} />
                <SmallBtn label="Can't verify" icon="help-circle" color="#6b7280" onPress={() => onDecision('unable_to_verify')} disabled={busy} colors={colors} />
                {result.suspected_duplicate_pin_id && (
                  <SmallBtn label="Confirm duplicate" icon="copy" color="#d97706" onPress={() => onDecision('mark_duplicate')} disabled={busy} colors={colors} />
                )}
                <SmallBtn label="Re-check" icon="refresh-cw" color={colors.primary} onPress={onRevalidate} disabled={busy} colors={colors} />
              </>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SmallBtn({ label, icon, color, onPress, disabled, colors }: {
  label: string; icon: keyof typeof Feather.glyphMap; color: string;
  onPress: () => void; disabled: boolean; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.smallBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: disabled ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Feather name={icon} size={13} color={color} />
      <Text style={[styles.smallBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  error: { fontSize: 13, marginBottom: 8 },
  startBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  seriesBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  seriesLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  seriesInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  seriesOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  seriesOptionText: { fontSize: 13.5, flex: 1 },
  seriesChosenRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  startBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  summaryTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  summaryLabel: { flex: 1, fontSize: 13 },
  summaryValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  apiLine: { fontSize: 12, marginTop: 8 },
  summaryActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 4 },
  detailValue: { fontSize: 13, lineHeight: 18 },
  flagRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  flagText: { flex: 1, fontSize: 13, lineHeight: 18 },
  notes: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  candidate: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 10, padding: 8, marginBottom: 6 },
  candThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#fff' },
  candTitle: { fontSize: 12.5, lineHeight: 16 },
  candMeta: { fontSize: 11.5, marginTop: 2 },
  priceNote: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  linkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  fieldText: { fontSize: 13, flex: 1 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 11, marginTop: 8 },
  actionBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  decisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  smallBtnText: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '94%', height: '75%' },
  viewerClose: { position: 'absolute', bottom: 48, alignItems: 'center', gap: 6 },
  viewerCloseText: { color: '#fff', fontSize: 13 },
});
