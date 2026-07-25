/**
 * Admin Catalogue Import screen.
 *
 * Step 1: Pick .xlsx file → call preview endpoint
 * Step 2: Review headers + first 20 rows + column mapping
 * Step 3: Dry run → review counts
 * Step 4: Confirm → real import kicks off async, returns batchId
 * Step 5: Live progress polling (every 2 s) — progress bar + row counts
 * Step 6: Summary + error report with tap-to-edit per row
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

const POLL_INTERVAL_MS = 2000;

type Step = 'idle' | 'previewing' | 'preview_done' | 'dry_running' | 'dry_done' | 'importing' | 'done';

interface ColMap { spreadsheetHeader: string; databaseField: string }

interface PreviewData {
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  previewRows: Record<string, unknown>[];
  totalRows: number;
  columnMapping: ColMap[];
  fileHash: string;
  filename: string;
}

interface ImportSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows?: number;
  seedRows: number;
  verifiedRows: number;
  missingFrontImage: number;
  missingBackImage: number;
}

interface BatchStatus {
  id: string;
  filename: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_rows: number;
  progress_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  seed_rows: number;
  verified_rows: number;
  started_at: string;
  completed_at: string | null;
  error_report: ErrorRow[] | null;
}

interface BatchListItem {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  progress_rows: number;
  inserted_rows: number;
  updated_rows: number;
  error_rows: number;
  started_at: string;
  completed_at: string | null;
}

interface ErrorRow {
  rowNum: number;
  pinhuntId: string | null;
  title: string | null;
  result: 'error' | 'warning';
  message: string;
  fields?: Record<string, unknown>;
}

// Fields an admin can edit to fix a row
interface EditableFields {
  pinhunt_id: string;
  title: string;
  brand: string;
  collection: string;
  characters: string;
  categories: string;
  release_year: string;
  image_url: string;
  back_image_url: string;
  verification_status: string;
  retailer: string;
  retail_price: string;
  currency: string;
  edition_type: string;
  limited_edition_size: string;
  source_url: string;
  manufacturer: string;
  notes: string;
}

function makeEditableFields(row: ErrorRow): EditableFields {
  const f = row.fields ?? {};
  return {
    pinhunt_id: String(f.pinhunt_id ?? row.pinhuntId ?? ''),
    title: String(f.title ?? row.title ?? ''),
    brand: String(f.brand ?? ''),
    collection: String(f.collection ?? ''),
    characters: String(f.characters ?? ''),
    categories: String(f.categories ?? ''),
    release_year: String(f.release_year ?? ''),
    image_url: String(f.image_url ?? ''),
    back_image_url: String(f.back_image_url ?? ''),
    verification_status: String(f.verification_status ?? ''),
    retailer: String(f.retailer ?? ''),
    retail_price: String(f.retail_price ?? ''),
    currency: String(f.currency ?? 'GBP'),
    edition_type: String(f.edition_type ?? ''),
    limited_edition_size: String(f.limited_edition_size ?? ''),
    source_url: String(f.source_url ?? ''),
    manufacturer: String(f.manufacturer ?? ''),
    notes: String(f.notes ?? ''),
  };
}

export default function CatalogueImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [step, setStep] = useState<Step>('idle');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('upload.xlsx');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [dryRunSummary, setDryRunSummary] = useState<ImportSummary | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [errorReport, setErrorReport] = useState<ErrorRow[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [showPreviewRows, setShowPreviewRows] = useState(false);

  // Import history (past batches)
  const [batchList, setBatchList] = useState<BatchListItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [openingBatchId, setOpeningBatchId] = useState<string | null>(null);

  // Edit modal state
  const [editingRow, setEditingRow] = useState<ErrorRow | null>(null);
  const [editFields, setEditFields] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const token = session?.access_token;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 20;

  // ── Polling ──

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchBatchStatus = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import/batches/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data: BatchStatus = await resp.json();
      setBatchStatus(data);
      if (data.error_report) setErrorReport(data.error_report);
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling();
        setStep('done');
        setStatusMsg('');
      }
    } catch {
      // network hiccup — keep polling
    }
  }, [token, stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    fetchBatchStatus(id);
    pollRef.current = setInterval(() => fetchBatchStatus(id), POLL_INTERVAL_MS);
  }, [fetchBatchStatus, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Import history ──

  const fetchBatchList = useCallback(async () => {
    if (!token) return;
    setLoadingBatches(true);
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import/batches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setBatchList(data.batches ?? []);
      }
    } catch {
      // ignore — history is best-effort
    } finally {
      setLoadingBatches(false);
    }
  }, [token]);

  useEffect(() => {
    if (step === 'idle') fetchBatchList();
  }, [step, fetchBatchList]);

  const openPastBatch = async (batch: BatchListItem) => {
    if (!token || openingBatchId) return;
    setOpeningBatchId(batch.id);
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import/batches/${batch.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: BatchStatus = await resp.json();
      if (!resp.ok) throw new Error((data as unknown as { error?: string }).error ?? 'Could not load batch');
      setBatchId(batch.id);
      setBatchStatus(data);
      setErrorReport(data.error_report ?? []);
      if (data.status === 'running' || data.status === 'pending') {
        setStep('importing');
        startPolling(batch.id);
      } else {
        setStep('done');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load batch');
    } finally {
      setOpeningBatchId(null);
    }
  };

  // ── File picker ──

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setFilename(asset.name ?? 'upload.xlsx');
      setStep('previewing');
      setStatusMsg('Reading file…');

      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setFileBase64(base64);

      setStatusMsg('Analysing workbook…');
      const resp = await fetch(`${API_BASE}/admin/catalogue-import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileBase64: base64, filename: asset.name }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Preview failed');

      setPreview(data);
      setStep('preview_done');
      setStatusMsg('');
    } catch (e) {
      setStep('idle');
      setStatusMsg('');
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not read file');
    }
  };

  // ── Dry run ──

  const handleDryRun = async () => {
    if (!fileBase64 || !token) return;
    setStep('dry_running');
    setStatusMsg('Running dry run…');
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileBase64, filename, sheetName: preview?.selectedSheet, dryRun: true }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Dry run failed');
      setDryRunSummary(data.summary);
      setErrorReport(data.errorReport ?? []);
      setStep('dry_done');
      setStatusMsg('');
    } catch (e) {
      setStep('preview_done');
      setStatusMsg('');
      Alert.alert('Dry run failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  // ── Real import ──

  const handleImport = (force = false) => {
    Alert.alert(
      'Start Import',
      `This will import up to ${preview?.totalRows.toLocaleString()} pins into the catalogue. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', style: 'default', onPress: () => runImport(force) },
      ],
    );
  };

  const runImport = async (force: boolean) => {
    if (!fileBase64 || !token) return;
    setStep('importing');
    setBatchStatus(null);
    setStatusMsg('Starting import…');
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileBase64, filename, sheetName: preview?.selectedSheet, dryRun: false, force }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.error === 'duplicate_file') {
          setStep('dry_done');
          setStatusMsg('');
          Alert.alert(
            'File already imported',
            `This exact file was already imported on batch ${data.existingBatchId}. Import again?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Import again', onPress: () => runImport(true) },
            ],
          );
          return;
        }
        throw new Error(data.error ?? 'Import failed');
      }
      // Server responded immediately with batchId — start polling
      setBatchId(data.batchId);
      setStatusMsg('');
      startPolling(data.batchId);
    } catch (e) {
      setStep('dry_done');
      setStatusMsg('');
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  // ── Error row editing ──

  const openEditRow = (row: ErrorRow) => {
    setEditingRow(row);
    setEditFields(makeEditableFields(row));
  };

  const closeEditRow = () => {
    setEditingRow(null);
    setEditFields(null);
    setSaving(false);
  };

  const saveEditedRow = async () => {
    if (!editingRow || !editFields || !batchId || !token) return;
    setSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/admin/catalogue-import/batches/${batchId}/reprocess-row`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rowNum: editingRow.rowNum,
          fields: {
            pinhunt_id: editFields.pinhunt_id || null,
            title: editFields.title || null,
            brand: editFields.brand || null,
            collection: editFields.collection || null,
            characters: editFields.characters || null,
            categories: editFields.categories || null,
            release_year: editFields.release_year ? Number(editFields.release_year) : null,
            image_url: editFields.image_url || null,
            back_image_url: editFields.back_image_url || null,
            verification_status: editFields.verification_status || null,
            retailer: editFields.retailer || null,
            retail_price: editFields.retail_price ? Number(editFields.retail_price) : null,
            currency: editFields.currency || 'GBP',
            edition_type: editFields.edition_type || null,
            limited_edition_size: editFields.limited_edition_size ? Number(editFields.limited_edition_size) : null,
            source_url: editFields.source_url || null,
            manufacturer: editFields.manufacturer || null,
            notes: editFields.notes || null,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert('Save failed', data.error ?? 'Unknown error');
        setSaving(false);
        return;
      }
      // Refresh batch status to get updated error_report
      await fetchBatchStatus(batchId);
      closeEditRow();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
    }
  };

  // ── Download error report ──

  const downloadErrorReport = async (rows: ErrorRow[]) => {
    if (!rows.length) { Alert.alert('No errors', 'There are no error rows to export.'); return; }
    const header = 'Row,PinHunt ID,Pin Name,Result,Message';
    const csvRows = rows.map(r =>
      `${r.rowNum},${r.pinhuntId ?? ''},${JSON.stringify(r.title ?? '')},${r.result},${JSON.stringify(r.message)}`,
    );
    const csv = [header, ...csvRows].join('\n');
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    const path = `${cacheDir}import_errors.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Error Report' });
    } else {
      Alert.alert('Saved', `Error report saved to: ${path}`);
    }
  };

  // ── Reset ──

  const reset = () => {
    stopPolling();
    setStep('idle'); setFileBase64(null); setPreview(null);
    setDryRunSummary(null); setBatchId(null); setBatchStatus(null);
    setErrorReport([]); setStatusMsg('');
    setShowMapping(false); setShowPreviewRows(false);
    closeEditRow();
  };

  // ── Derived progress values ──

  const progressFraction = batchStatus
    ? batchStatus.total_rows > 0
      ? Math.min(batchStatus.progress_rows / batchStatus.total_rows, 1)
      : 0
    : 0;

  const remainingRows = batchStatus
    ? Math.max(0, batchStatus.total_rows - batchStatus.progress_rows)
    : 0;

  const errorOnlyRows = errorReport.filter(r => r.result === 'error');
  const warningOnlyRows = errorReport.filter(r => r.result === 'warning');

  return (
    <>
      <Stack.Screen options={{ title: 'Catalogue Import' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>Excel Catalogue Import</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Upload a .xlsx workbook to bulk-load pins into the catalogue. Always run a dry run first.
          </Text>
        </View>

        {/* ── Step 1: File picker ── */}
        {step === 'idle' && (
          <TouchableOpacity
            onPress={handlePickFile}
            activeOpacity={0.85}
            style={[styles.pickBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Feather name="upload" size={20} color="#fff" />
            <Text style={styles.pickBtnLabel}>Choose .xlsx File</Text>
          </TouchableOpacity>
        )}

        {/* ── Import history (past batches) ── */}
        {step === 'idle' && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>IMPORT HISTORY</Text>
              {loadingBatches && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
            {!loadingBatches && batchList.length === 0 && (
              <Text style={[styles.editHint, { color: colors.mutedForeground }]}>No past imports yet.</Text>
            )}
            {batchList.length > 0 && (
              <Text style={[styles.editHint, { color: colors.mutedForeground }]}>
                Tap a batch to reopen its summary and error report — you can keep fixing error rows where you left off.
              </Text>
            )}
            {batchList.map(b => (
              <TouchableOpacity
                key={b.id}
                onPress={() => openPastBatch(b)}
                disabled={!!openingBatchId}
                activeOpacity={0.75}
                style={[styles.batchRow, { borderTopColor: colors.border }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.batchRowName, { color: colors.foreground }]} numberOfLines={1}>
                    {b.filename}
                  </Text>
                  <Text style={[styles.batchRowMeta, { color: colors.mutedForeground }]}>
                    {new Date(b.started_at).toLocaleDateString()} · {b.total_rows.toLocaleString()} rows · {b.status}
                  </Text>
                </View>
                {b.error_rows > 0 && (
                  <View style={[styles.errorCountBadge, { backgroundColor: colors.destructive + '18' }]}>
                    <Text style={[styles.errorCountBadgeText, { color: colors.destructive }]}>
                      {b.error_rows} {b.error_rows === 1 ? 'error' : 'errors'}
                    </Text>
                  </View>
                )}
                {openingBatchId === b.id
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Loading: preview / dry run ── */}
        {(step === 'previewing' || step === 'dry_running') && (
          <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>{statusMsg}</Text>
          </View>
        )}

        {/* ── Step importing: live progress bar ── */}
        {step === 'importing' && (
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            {!batchStatus ? (
              <>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.loadingText, { color: colors.foreground }]}>Starting import…</Text>
              </>
            ) : (
              <>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressLabel, { color: colors.foreground }]}>Importing…</Text>
                  <Text style={[styles.progressPct, { color: colors.primary }]}>
                    {Math.round(progressFraction * 100)}%
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: colors.primary, width: `${Math.round(progressFraction * 100)}%` as `${number}%` },
                    ]}
                  />
                </View>

                {/* Live counters */}
                <View style={styles.liveCountRow}>
                  <LiveCount label="Inserted" value={batchStatus.inserted_rows} color={colors.primary} />
                  <LiveCount label="Updated" value={batchStatus.updated_rows} color={colors.owned} />
                  <LiveCount label="Remaining" value={remainingRows} color={colors.mutedForeground} />
                  <LiveCount label="Errors" value={batchStatus.error_rows} color={colors.destructive} />
                </View>

                <Text style={[styles.progressNote, { color: colors.mutedForeground }]}>
                  {batchStatus.progress_rows.toLocaleString()} / {batchStatus.total_rows.toLocaleString()} rows processed
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Step 2: Preview ── */}
        {preview && (step === 'preview_done' || step === 'dry_done' || step === 'done') && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <Row label="File" value={preview.filename} />
            <Row label="Sheet" value={preview.selectedSheet} />
            <Row label="Total rows" value={preview.totalRows.toLocaleString()} />
            <Row label="Columns detected" value={String(preview.headers.length)} />

            <TouchableOpacity onPress={() => setShowMapping(!showMapping)} style={styles.expandRow}>
              <Text style={[styles.expandLabel, { color: colors.primary }]}>
                {showMapping ? 'Hide' : 'Show'} column mapping
              </Text>
              <Feather name={showMapping ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </TouchableOpacity>

            {showMapping && (
              <View style={styles.mappingTable}>
                <View style={styles.mappingHeader}>
                  <Text style={[styles.mappingCell, styles.mappingHeaderText, { color: colors.mutedForeground, flex: 1 }]}>Spreadsheet</Text>
                  <Text style={[styles.mappingCell, styles.mappingHeaderText, { color: colors.mutedForeground, flex: 1 }]}>Database field</Text>
                </View>
                {preview.columnMapping.map((m, i) => (
                  <View key={i} style={[styles.mappingRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.mappingCell, { color: colors.foreground, flex: 1 }]}>{m.spreadsheetHeader}</Text>
                    <Text style={[styles.mappingCell, { color: m.databaseField === '(unmapped)' ? colors.destructive : colors.owned, flex: 1 }]}>
                      {m.databaseField}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity onPress={() => setShowPreviewRows(!showPreviewRows)} style={styles.expandRow}>
              <Text style={[styles.expandLabel, { color: colors.primary }]}>
                {showPreviewRows ? 'Hide' : 'Show'} first 5 rows
              </Text>
              <Feather name={showPreviewRows ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </TouchableOpacity>

            {showPreviewRows && (
              <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: 8 }}>
                <View>
                  <View style={[styles.tableRow, { backgroundColor: colors.secondary }]}>
                    {preview.headers.slice(0, 6).map((h, i) => (
                      <Text key={i} style={[styles.tableCell, styles.tableHeader, { color: colors.foreground, borderColor: colors.border }]}>{h}</Text>
                    ))}
                  </View>
                  {preview.previewRows.slice(0, 5).map((row, ri) => (
                    <View key={ri} style={[styles.tableRow, { borderTopColor: colors.border }]}>
                      {preview.headers.slice(0, 6).map((h, ci) => (
                        <Text key={ci} numberOfLines={1} style={[styles.tableCell, { color: colors.mutedForeground, borderColor: colors.border }]}>
                          {String(row[preview.columnMapping[ci]?.databaseField ?? h] ?? row[h] ?? '')}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Dry run button ── */}
        {step === 'preview_done' && (
          <TouchableOpacity
            onPress={handleDryRun}
            activeOpacity={0.85}
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.primary, borderRadius: 12 }]}
          >
            <Feather name="eye" size={18} color={colors.primary} />
            <Text style={[styles.actionBtnLabel, { color: colors.primary }]}>Run Dry Run</Text>
          </TouchableOpacity>
        )}

        {/* ── Dry run results ── */}
        {dryRunSummary && (step === 'dry_done' || step === 'done') && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>DRY RUN RESULTS</Text>
            <SummaryGrid summary={dryRunSummary} colors={colors} />
            {errorReport.length > 0 && (
              <TouchableOpacity
                onPress={() => downloadErrorReport(errorReport)}
                style={[styles.smallBtn, { borderColor: colors.border }]}
              >
                <Feather name="download" size={14} color={colors.mutedForeground} />
                <Text style={[styles.smallBtnLabel, { color: colors.mutedForeground }]}>
                  Download error report ({errorReport.length} rows)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Import button ── */}
        {step === 'dry_done' && (
          <TouchableOpacity
            onPress={() => handleImport(false)}
            activeOpacity={0.85}
            style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Feather name="download-cloud" size={18} color="#fff" />
            <Text style={[styles.actionBtnLabel, { color: '#fff' }]}>
              Import {preview?.totalRows.toLocaleString()} Pins
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Import complete summary ── */}
        {step === 'done' && batchStatus && (
          <View style={[styles.card, {
            backgroundColor: colors.card,
            borderColor: batchStatus.status === 'completed' ? colors.owned + '40' : colors.destructive + '40',
            borderRadius: 12,
          }]}>
            <View style={styles.successRow}>
              <Feather
                name={batchStatus.status === 'completed' ? 'check-circle' : 'alert-circle'}
                size={20}
                color={batchStatus.status === 'completed' ? colors.owned : colors.destructive}
              />
              <Text style={[styles.cardTitle, {
                color: batchStatus.status === 'completed' ? colors.owned : colors.destructive,
              }]}>
                {batchStatus.status === 'completed' ? 'IMPORT COMPLETE' : 'IMPORT FAILED'}
              </Text>
            </View>
            <Text style={[styles.batchId, { color: colors.mutedForeground }]}>Batch: {batchStatus.id}</Text>
            <SummaryGrid
              summary={{
                totalRows: batchStatus.total_rows,
                validRows: batchStatus.inserted_rows + batchStatus.updated_rows,
                errorRows: batchStatus.error_rows,
                warningRows: 0,
                insertedRows: batchStatus.inserted_rows,
                updatedRows: batchStatus.updated_rows,
                skippedRows: batchStatus.skipped_rows,
                seedRows: batchStatus.seed_rows,
                verifiedRows: batchStatus.verified_rows,
                missingFrontImage: 0,
                missingBackImage: 0,
              }}
              colors={colors}
            />
          </View>
        )}

        {/* ── Error report with edit actions ── */}
        {step === 'done' && errorOnlyRows.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.cardTitle, { color: colors.destructive }]}>
                ERRORS ({errorOnlyRows.length})
              </Text>
              <TouchableOpacity onPress={() => downloadErrorReport(errorOnlyRows)}>
                <Feather name="download" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.editHint, { color: colors.mutedForeground }]}>
              Tap a row to fix the values and re-import without re-uploading the file.
            </Text>
            {errorOnlyRows.slice(0, 50).map((row, i) => (
              <ErrorRowCard
                key={`${row.rowNum}-${i}`}
                row={row}
                colors={colors}
                onEdit={() => openEditRow(row)}
              />
            ))}
            {errorOnlyRows.length > 50 && (
              <Text style={[styles.moreRows, { color: colors.mutedForeground }]}>
                + {errorOnlyRows.length - 50} more errors — download the report for the full list.
              </Text>
            )}
          </View>
        )}

        {/* ── Warning report ── */}
        {step === 'done' && warningOnlyRows.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.cardTitle, { color: '#F59E0B' }]}>
                WARNINGS ({warningOnlyRows.length})
              </Text>
              <TouchableOpacity onPress={() => downloadErrorReport(warningOnlyRows)}>
                <Feather name="download" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {warningOnlyRows.slice(0, 20).map((row, i) => (
              <ErrorRowCard
                key={`w-${row.rowNum}-${i}`}
                row={row}
                colors={colors}
                onEdit={() => openEditRow(row)}
              />
            ))}
            {warningOnlyRows.length > 20 && (
              <Text style={[styles.moreRows, { color: colors.mutedForeground }]}>
                + {warningOnlyRows.length - 20} more warnings
              </Text>
            )}
          </View>
        )}

        {/* ── Start again ── */}
        {(step === 'preview_done' || step === 'dry_done' || step === 'done') && (
          <TouchableOpacity onPress={reset} style={styles.resetBtn}>
            <Text style={[styles.resetLabel, { color: colors.mutedForeground }]}>← Choose a different file</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Edit row modal ── */}
      <Modal
        visible={!!editingRow}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditRow}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={closeEditRow} disabled={saving}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Fix Row {editingRow?.rowNum}</Text>
            <TouchableOpacity onPress={saveEditedRow} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[styles.modalSave, { color: colors.primary }]}>Save &amp; Re-import</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {editingRow && (
              <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{editingRow.message}</Text>
              </View>
            )}

            {editFields && (
              <>
                <EditField label="Pin Name *" value={editFields.title} onChangeText={v => setEditFields(f => f ? { ...f, title: v } : f)} colors={colors} />
                <EditField label="PinHunt ID" value={editFields.pinhunt_id} onChangeText={v => setEditFields(f => f ? { ...f, pinhunt_id: v } : f)} colors={colors} placeholder="PHUK-001" />
                <EditField label="Brand" value={editFields.brand} onChangeText={v => setEditFields(f => f ? { ...f, brand: v } : f)} colors={colors} />
                <EditField label="Collection / Series" value={editFields.collection} onChangeText={v => setEditFields(f => f ? { ...f, collection: v } : f)} colors={colors} />
                <EditField label="Characters (semicolon-separated)" value={editFields.characters} onChangeText={v => setEditFields(f => f ? { ...f, characters: v } : f)} colors={colors} placeholder="Mickey; Donald" />
                <EditField label="Categories (semicolon-separated)" value={editFields.categories} onChangeText={v => setEditFields(f => f ? { ...f, categories: v } : f)} colors={colors} />
                <EditField label="Release Year" value={editFields.release_year} onChangeText={v => setEditFields(f => f ? { ...f, release_year: v } : f)} colors={colors} keyboardType="numeric" />
                <EditField label="Verification Status" value={editFields.verification_status} onChangeText={v => setEditFields(f => f ? { ...f, verification_status: v } : f)} colors={colors} placeholder="verified / unverified / community_submitted" />
                <EditField label="Front Image URL" value={editFields.image_url} onChangeText={v => setEditFields(f => f ? { ...f, image_url: v } : f)} colors={colors} keyboardType="url" />
                <EditField label="Back Image URL" value={editFields.back_image_url} onChangeText={v => setEditFields(f => f ? { ...f, back_image_url: v } : f)} colors={colors} keyboardType="url" />
                <EditField label="Retailer / Park" value={editFields.retailer} onChangeText={v => setEditFields(f => f ? { ...f, retailer: v } : f)} colors={colors} />
                <EditField label="Original Price" value={editFields.retail_price} onChangeText={v => setEditFields(f => f ? { ...f, retail_price: v } : f)} colors={colors} keyboardType="decimal-pad" />
                <EditField label="Currency" value={editFields.currency} onChangeText={v => setEditFields(f => f ? { ...f, currency: v } : f)} colors={colors} placeholder="GBP" />
                <EditField label="Edition Type" value={editFields.edition_type} onChangeText={v => setEditFields(f => f ? { ...f, edition_type: v } : f)} colors={colors} />
                <EditField label="Edition Size" value={editFields.limited_edition_size} onChangeText={v => setEditFields(f => f ? { ...f, limited_edition_size: v } : f)} colors={colors} keyboardType="numeric" />
                <EditField label="Source URL" value={editFields.source_url} onChangeText={v => setEditFields(f => f ? { ...f, source_url: v } : f)} colors={colors} keyboardType="url" />
                <EditField label="Manufacturer" value={editFields.manufacturer} onChangeText={v => setEditFields(f => f ? { ...f, manufacturer: v } : f)} colors={colors} />
                <EditField label="Notes" value={editFields.notes} onChangeText={v => setEditFields(f => f ? { ...f, notes: v } : f)} colors={colors} multiline />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function LiveCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.liveCountItem}>
      <Text style={[styles.liveCountValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.liveCountLabel, { color }]}>{label}</Text>
    </View>
  );
}

function SummaryGrid({ summary, colors }: { summary: ImportSummary; colors: ReturnType<typeof useColors> }) {
  const items = [
    { label: 'Total rows', value: summary.totalRows, color: colors.foreground },
    { label: 'Valid', value: summary.validRows, color: colors.owned },
    { label: 'Errors', value: summary.errorRows, color: colors.destructive },
    { label: 'Warnings', value: summary.warningRows, color: '#F59E0B' },
    { label: 'New records', value: summary.insertedRows, color: colors.primary },
    { label: 'Updates', value: summary.updatedRows, color: colors.mutedForeground },
    { label: 'Seed records', value: summary.seedRows, color: '#F59E0B' },
    { label: 'Verified', value: summary.verifiedRows, color: colors.owned },
    { label: 'No front image', value: summary.missingFrontImage, color: colors.mutedForeground },
    { label: 'No back image', value: summary.missingBackImage, color: colors.mutedForeground },
  ];
  return (
    <View style={styles.summaryGrid}>
      {items.map(item => (
        <View key={item.label} style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: item.color }]}>{(item.value ?? 0).toLocaleString()}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ErrorRowCard({
  row,
  colors,
  onEdit,
}: {
  row: ErrorRow;
  colors: ReturnType<typeof useColors>;
  onEdit: () => void;
}) {
  const isError = row.result === 'error';
  const accent = isError ? colors.destructive : '#F59E0B';
  return (
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={0.75}
      style={[styles.errorRowCard, { borderLeftColor: accent, backgroundColor: accent + '0C' }]}
    >
      <View style={styles.errorRowTop}>
        <View style={styles.errorRowMeta}>
          <Text style={[styles.errorRowNum, { color: colors.mutedForeground }]}>Row {row.rowNum}</Text>
          {row.pinhuntId && (
            <Text style={[styles.errorRowId, { color: colors.mutedForeground }]}> · {row.pinhuntId}</Text>
          )}
        </View>
        {isError && (
          <View style={[styles.editBadge, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="edit-2" size={11} color={colors.primary} />
            <Text style={[styles.editBadgeText, { color: colors.primary }]}>Fix</Text>
          </View>
        )}
      </View>
      {row.title && (
        <Text style={[styles.errorRowTitle, { color: colors.foreground }]} numberOfLines={1}>{row.title}</Text>
      )}
      <Text style={[styles.errorRowMsg, { color: accent }]}>{row.message}</Text>
    </TouchableOpacity>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  colors,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ReturnType<typeof useColors>;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'url';
  multiline?: boolean;
}) {
  return (
    <View style={styles.editFieldWrap}>
      <Text style={[styles.editFieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.mutedForeground + '80'}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.editFieldInput,
          {
            color: colors.foreground,
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            minHeight: multiline ? 72 : undefined,
          },
        ]}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:              { flex: 1 },
  headerBlock:       { gap: 6 },
  title:             { fontSize: 22, fontFamily: 'Inter_700Bold' },
  subtitle:          { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  pickBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  pickBtnLabel:      { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  loadingCard:       { alignItems: 'center', padding: 32, gap: 16, borderWidth: 1 },
  loadingText:       { fontSize: 15, fontFamily: 'Inter_500Medium', textAlign: 'center' },

  // Progress card
  progressCard:      { padding: 16, borderWidth: 1, gap: 12 },
  progressHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel:     { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  progressPct:       { fontSize: 15, fontFamily: 'Inter_700Bold' },
  progressTrack:     { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill:      { height: 8, borderRadius: 4 },
  liveCountRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  liveCountItem:     { alignItems: 'center', flex: 1 },
  liveCountValue:    { fontSize: 18, fontFamily: 'Inter_700Bold' },
  liveCountLabel:    { fontSize: 10, fontFamily: 'Inter_400Regular' },
  progressNote:      { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  card:              { padding: 16, borderWidth: 1, gap: 8 },
  cardTitle:         { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 4 },
  infoRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:         { fontSize: 13, fontFamily: 'Inter_400Regular' },
  infoValue:         { fontSize: 13, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  expandRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  expandLabel:       { fontSize: 13, fontFamily: 'Inter_500Medium' },
  mappingTable:      { marginTop: 8 },
  mappingHeader:     { flexDirection: 'row', paddingBottom: 6 },
  mappingHeaderText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },
  mappingRow:        { flexDirection: 'row', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  mappingCell:       { fontSize: 12, fontFamily: 'Inter_400Regular', paddingRight: 8 },
  tableRow:          { flexDirection: 'row' },
  tableCell:         { fontSize: 11, fontFamily: 'Inter_400Regular', width: 120, paddingHorizontal: 6, paddingVertical: 5, borderRightWidth: StyleSheet.hairlineWidth },
  tableHeader:       { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  actionBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderWidth: 1.5 },
  actionBtnLabel:    { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  summaryItem:       { width: '50%', paddingVertical: 8, alignItems: 'center' },
  summaryCount:      { fontSize: 20, fontFamily: 'Inter_700Bold' },
  summaryLabel:      { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  smallBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  smallBtnLabel:     { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  successRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  batchId:           { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  resetBtn:          { alignItems: 'center', paddingVertical: 8 },
  resetLabel:        { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Error report
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  editHint:          { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  errorRowCard:      { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 10, paddingRight: 8, marginVertical: 4, borderRadius: 4, gap: 3 },
  errorRowTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorRowMeta:      { flexDirection: 'row', alignItems: 'center' },
  errorRowNum:       { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  errorRowId:        { fontSize: 11, fontFamily: 'Inter_400Regular' },
  errorRowTitle:     { fontSize: 13, fontFamily: 'Inter_500Medium' },
  errorRowMsg:       { fontSize: 12, fontFamily: 'Inter_400Regular' },
  editBadge:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  editBadgeText:     { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  moreRows:          { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingTop: 8 },

  // Import history
  batchRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  batchRowName:        { fontSize: 13, fontFamily: 'Inter_500Medium' },
  batchRowMeta:        { fontSize: 11, fontFamily: 'Inter_400Regular' },
  errorCountBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  errorCountBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Modal
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle:        { fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  modalCancel:       { fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalSave:         { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  errorBanner:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  errorBannerText:   { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  editFieldWrap:     { gap: 4 },
  editFieldLabel:    { fontSize: 12, fontFamily: 'Inter_500Medium' },
  editFieldInput:    { fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
