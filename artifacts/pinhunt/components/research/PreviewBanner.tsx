/**
 * Banner for the static web preview of Research Review (lib/researchPreview). Says where decisions
 * live (this browser only) and offers JSON export / import, so they can be moved between the Mac and
 * the iPad or kept as a backup. Rendered only when isStaticResearchPreview.
 */
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { clearDecisions, exportDecisions, importDecisions, previewInfo, type PreviewInfo } from '@/lib/researchPreview';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pickFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => { const f = input.files?.[0]; if (!f) resolve(null); else f.text().then(resolve, () => resolve(null)); };
    input.click();
  });
}

export default function PreviewBanner() {
  const colors = useColors();
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { previewInfo().then(setInfo, e => setMsg((e as Error).message)); }, []);
  if (Platform.OS !== 'web') return null;

  const onExport = async () => {
    const { text, count } = await exportDecisions();
    download(`research-review-decisions-${new Date().toISOString().slice(0, 10)}.json`, text);
    setMsg(`Exported ${count} decision${count === 1 ? '' : 's'}.`);
  };
  const onImport = async () => {
    const text = await pickFile();
    if (!text) return;
    try {
      const { applied, skipped } = await importDecisions(text);
      setMsg(`Imported ${applied} decision${applied === 1 ? '' : 's'}${skipped ? `; ${skipped} not in this data were skipped` : ''}. Reloading…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) { setMsg((e as Error).message); }
  };
  const onReset = () => { clearDecisions(); window.location.reload(); };

  return (
    <View style={[s.box, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]} testID="preview-banner">
      <Text style={[s.title, { color: colors.homeInk }]}>Preview</Text>
      <Text style={[s.body, { color: colors.homeMuted }]}>
        {info ? `${info.pins.toLocaleString()} researched pins` : 'Loading research data…'}
        {info?.generated ? `, research run of ${info.generated}` : ''}. Nothing here touches Supabase or the catalogue.
        Your decisions are saved in this browser only: export them to back up or to continue on another device.
      </Text>
      <View style={s.row}>
        <Button label="Export decisions" icon="download" variant="secondary" size="compact" onPress={onExport} />
        <Button label="Import decisions" icon="upload" variant="secondary" size="compact" onPress={onImport} />
        {confirmReset
          ? <Button label="Confirm: clear this browser's decisions" variant="destructive" size="compact" onPress={onReset} />
          : <Button label="Start over" variant="text" size="compact" onPress={() => setConfirmReset(true)} />}
      </View>
      {msg && <Text style={[s.body, { color: colors.homeInk }]} accessibilityLiveRegion="polite">{msg}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
});
