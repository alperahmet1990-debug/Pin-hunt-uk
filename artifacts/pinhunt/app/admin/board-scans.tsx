/**
 * Admin — Board Scans (bulk catalogue image capture, Step A).
 *
 * Upload a photo of a pin trading board with its permission record; the
 * API server finds each pin, matches it to the catalogue and cleans up the
 * crops worth publishing (routes/board-scans.ts). Review happens on
 * /admin/board-scan/[id]. Nothing is published from here.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { formatDate } from '@/utils/format';

interface BoardScanSummary {
  id: string;
  title: string | null;
  status: string;
  contributor_name: string | null;
  permission_basis: 'own_photo' | 'contributor_permission';
  permission_public_display: boolean;
  error: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  detecting: 'Finding pins…',
  matching: 'Matching…',
  cleaning: 'Cleaning photos…',
  ready: 'Ready to review',
  partial: 'Partly processed',
  failed: 'Failed',
};

type Basis = 'own_photo' | 'contributor_permission';

export default function AdminBoardScansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token;

  const [scans, setScans] = useState<BoardScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [title, setTitle] = useState('');
  const [basis, setBasis] = useState<Basis>('contributor_permission');
  const [contributorName, setContributorName] = useState('');
  const [contributorHandle, setContributorHandle] = useState('');
  const [evidence, setEvidence] = useState('');
  const [processing, setProcessing] = useState(false);
  const [publicDisplay, setPublicDisplay] = useState(false);
  const [notCatalogue, setNotCatalogue] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true);
      setError(null);
      const res = await fetch(`${API_BASE}/admin/board-scans`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load boards.');
      setScans(data.scans as BoardScanSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load boards.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pick = useCallback(async (source: 'library' | 'camera') => {
    setFormError(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.92, base64: true, exif: false };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setFormError('Camera permission is needed to take a photo.'); return; }
    }
    const picked = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return;
    if (!asset.base64) { setFormError('Could not read that photo — please try another.'); return; }
    setPhoto({ uri: asset.uri, base64: asset.base64 });
  }, []);

  const contributor = basis === 'contributor_permission';
  const canUpload = !!photo && processing && notCatalogue &&
    (!contributor || (contributorName.trim().length > 0 && evidence.trim().length > 0));

  const upload = useCallback(async () => {
    if (!token || !photo) return;
    setUploading(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/board-scans`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.base64,
          title: title.trim() || undefined,
          permission: {
            basis,
            contributorName: contributor ? contributorName.trim() : undefined,
            contributorHandle: contributor ? contributorHandle.trim() || undefined : undefined,
            evidence: evidence.trim() || undefined,
            processing,
            publicDisplay,
            notThirdPartyCatalogue: notCatalogue,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
      setPhoto(null);
      setTitle('');
      setEvidence('');
      router.push(`/admin/board-scan/${data.scan.id}` as Href);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [token, photo, title, basis, contributor, contributorName, contributorHandle, evidence, processing, publicDisplay, notCatalogue, router]);

  const card = [styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }];
  const input = [styles.input, { borderColor: colors.homeLine, color: colors.homeInk, backgroundColor: colors.homeBackground }];
  const toggle = (label: string, value: boolean, set: (v: boolean) => void, hint?: string) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: colors.homeInk }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.homeMuted }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={set} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Board Scans' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        contentContainerStyle={{ padding: 16, paddingBottom: (Platform.OS === 'web' ? 24 : insets.bottom + 16), gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />}
      >
        <Text style={[styles.intro, { color: colors.homeMuted }]}>
          Photograph a board of up to about 30 pins. Each pin is found, matched to the catalogue and, when the
          crop is good enough, cleaned up as a catalogue photo for you to approve. Nothing is published until you approve it.
        </Text>

        <View style={card}>
          <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>New board</Text>
          {photo ? (
            <Pressable onPress={() => pick('library')}>
              <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" />
            </Pressable>
          ) : (
            <View style={styles.pickRow}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={[styles.pickBtn, { borderColor: colors.homeLine }]} onPress={() => pick('camera')}>
                  <Feather name="camera" size={20} color={colors.homeCoral} />
                  <Text style={[styles.pickText, { color: colors.homeInk }]}>Take photo</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.pickBtn, { borderColor: colors.homeLine }]} onPress={() => pick('library')}>
                <Feather name="upload" size={20} color={colors.homeCoral} />
                <Text style={[styles.pickText, { color: colors.homeInk }]}>Choose photo</Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput style={input} placeholder="Label (e.g. Toy Story board)" placeholderTextColor={colors.homeMuted} value={title} onChangeText={setTitle} />

          <Text style={[styles.label, { color: colors.homeInk }]}>Whose photo is this?</Text>
          <View style={styles.segment}>
            {([['contributor_permission', "A collector's"], ['own_photo', 'Taken by PinHunt']] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                onPress={() => setBasis(value)}
                style={[styles.segmentBtn, { borderColor: colors.homeLine, backgroundColor: basis === value ? colors.homeAqua : 'transparent' }]}
              >
                <Text style={[styles.segmentText, { color: colors.homeInk }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {contributor && (
            <>
              <TextInput style={input} placeholder="Collector's name (required)" placeholderTextColor={colors.homeMuted} value={contributorName} onChangeText={setContributorName} />
              <TextInput style={input} placeholder="Facebook / Instagram handle" placeholderTextColor={colors.homeMuted} value={contributorHandle} onChangeText={setContributorHandle} autoCapitalize="none" />
            </>
          )}
          <TextInput
            style={[input, { minHeight: 60 }]}
            multiline
            placeholder={contributor
              ? 'Where the permission is recorded (required) — e.g. "Facebook message 11 Nov 2026, screenshot in the rights folder"'
              : 'Notes (optional)'}
            placeholderTextColor={colors.homeMuted}
            value={evidence}
            onChangeText={setEvidence}
          />

          {toggle('Permission to crop and process', processing, setProcessing, 'Required — the photo is cut into pins and cleaned up.')}
          {toggle('Permission to display publicly', publicDisplay, setPublicDisplay, 'Needed to publish crops as catalogue photos. Without it the board is matched only.')}
          {toggle('Not taken from Pin & Pop or another catalogue/website', notCatalogue, setNotCatalogue, 'Catalogue images from other sources must never be published as PinHunt photos.')}

          {formError ? <Text style={[styles.error, { color: colors.destructive }]}>{formError}</Text> : null}
          <TouchableOpacity
            disabled={!canUpload || uploading}
            onPress={upload}
            style={[styles.primary, { backgroundColor: colors.homeCoral, opacity: !canUpload || uploading ? 0.5 : 1 }]}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Scan board</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>Recent boards</Text>
        {loading ? (
          <ActivityIndicator color={colors.homeCoral} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : scans.length === 0 ? (
          <Text style={[styles.hint, { color: colors.homeMuted }]}>No boards yet.</Text>
        ) : (
          scans.map((s) => (
            <TouchableOpacity key={s.id} style={card} onPress={() => router.push(`/admin/board-scan/${s.id}` as Href)}>
              <View style={styles.rowBetween}>
                <Text style={[styles.scanTitle, { color: colors.homeInk }]} numberOfLines={1}>
                  {s.title || 'Untitled board'}
                </Text>
                <Text style={[styles.status, { color: s.status === 'failed' ? colors.destructive : colors.homeCoral }]}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </Text>
              </View>
              <Text style={[styles.hint, { color: colors.homeMuted }]}>
                {formatDate(s.created_at)} · {s.permission_basis === 'own_photo' ? 'PinHunt photo' : `From ${s.contributor_name ?? 'a collector'}`}
                {s.permission_public_display ? '' : ' · not for public display'}
              </Text>
              {s.error ? <Text style={[styles.hint, { color: colors.destructive }]} numberOfLines={2}>{s.error}</Text> : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  card: { borderWidth: 1, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  preview: { width: '100%', height: 220, borderRadius: 8 },
  pickRow: { flexDirection: 'row', gap: 10 },
  pickBtn: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 24, alignItems: 'center', gap: 6 },
  pickText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  segmentText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  primary: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  scanTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1 },
  status: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
