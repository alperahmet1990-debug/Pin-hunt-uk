/**
 * Admin Catalogue Import screen.
 *
 * Step 1: Pick .xlsx file → call preview endpoint
 * Step 2: Review headers + first 20 rows + column mapping
 * Step 3: Dry run → review counts
 * Step 4: Confirm → real import
 * Step 5: Summary + optional error CSV download
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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

interface ErrorRow { rowNum: number; pinhuntId: string | null; title: string | null; result: string; message: string }

export default function CatalogueImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [step, setStep] = useState<Step>('idle');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('upload.xlsx');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [dryRunSummary, setDryRunSummary] = useState<ImportSummary | null>(null);
  const [importResult, setImportResult] = useState<{ batchId: string; summary: ImportSummary; errorReport: ErrorRow[] } | null>(null);
  const [errorReport, setErrorReport] = useState<ErrorRow[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [showPreviewRows, setShowPreviewRows] = useState(false);

  const token = session?.access_token;

  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 20;

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
        {
          text: 'Import',
          style: 'default',
          onPress: () => runImport(force),
        },
      ],
    );
  };

  const runImport = async (force: boolean) => {
    if (!fileBase64 || !token) return;
    setStep('importing');
    setStatusMsg('Importing — this may take 1–2 minutes…');
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
      setImportResult(data);
      setErrorReport(data.errorReport ?? []);
      setStep('done');
      setStatusMsg('');
    } catch (e) {
      setStep('dry_done');
      setStatusMsg('');
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error');
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
    setStep('idle'); setFileBase64(null); setPreview(null);
    setDryRunSummary(null); setImportResult(null); setErrorReport([]);
    setStatusMsg(''); setShowMapping(false); setShowPreviewRows(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Catalogue Import' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, gap: 16 }}
        showsVerticalScrollIndicator={false}
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

        {/* ── Loading states ── */}
        {(step === 'previewing' || step === 'dry_running' || step === 'importing') && (
          <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>{statusMsg}</Text>
            {step === 'importing' && (
              <Text style={[styles.loadingNote, { color: colors.mutedForeground }]}>
                Processing 13,000+ pins in batches — please keep the screen open.
              </Text>
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

        {/* ── Import result ── */}
        {step === 'done' && importResult && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.owned + '40', borderRadius: 12 }]}>
            <View style={styles.successRow}>
              <Feather name="check-circle" size={20} color={colors.owned} />
              <Text style={[styles.cardTitle, { color: colors.owned }]}>IMPORT COMPLETE</Text>
            </View>
            <Text style={[styles.batchId, { color: colors.mutedForeground }]}>Batch: {importResult.batchId}</Text>
            <SummaryGrid summary={importResult.summary} colors={colors} />
            {importResult.errorReport.length > 0 && (
              <TouchableOpacity
                onPress={() => downloadErrorReport(importResult.errorReport)}
                style={[styles.smallBtn, { borderColor: colors.border }]}
              >
                <Feather name="download" size={14} color={colors.mutedForeground} />
                <Text style={[styles.smallBtnLabel, { color: colors.mutedForeground }]}>
                  Download error report ({importResult.errorReport.length} rows)
                </Text>
              </TouchableOpacity>
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

const styles = StyleSheet.create({
  root:           { flex: 1 },
  headerBlock:    { gap: 6 },
  title:          { fontSize: 22, fontFamily: 'Inter_700Bold' },
  subtitle:       { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  pickBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  pickBtnLabel:   { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  loadingCard:    { alignItems: 'center', padding: 32, gap: 16, borderWidth: 1 },
  loadingText:    { fontSize: 15, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  loadingNote:    { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  card:           { padding: 16, borderWidth: 1, gap: 8 },
  cardTitle:      { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 4 },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:      { fontSize: 13, fontFamily: 'Inter_400Regular' },
  infoValue:      { fontSize: 13, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  expandRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  expandLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium' },
  mappingTable:   { marginTop: 8 },
  mappingHeader:  { flexDirection: 'row', paddingBottom: 6 },
  mappingHeaderText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },
  mappingRow:     { flexDirection: 'row', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  mappingCell:    { fontSize: 12, fontFamily: 'Inter_400Regular', paddingRight: 8 },
  tableRow:       { flexDirection: 'row' },
  tableCell:      { fontSize: 11, fontFamily: 'Inter_400Regular', width: 120, paddingHorizontal: 6, paddingVertical: 5, borderRightWidth: StyleSheet.hairlineWidth },
  tableHeader:    { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderWidth: 1.5 },
  actionBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  summaryGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  summaryItem:    { width: '50%', paddingVertical: 8, alignItems: 'center' },
  summaryCount:   { fontSize: 20, fontFamily: 'Inter_700Bold' },
  summaryLabel:   { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  smallBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  smallBtnLabel:  { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  successRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  batchId:        { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  resetBtn:       { alignItems: 'center', paddingVertical: 8 },
  resetLabel:     { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
