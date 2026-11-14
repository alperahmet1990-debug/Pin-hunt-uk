/**
 * Admin Bulk Image Matcher — batches (App Creator only, staging first).
 *
 * Lists open batches with their progress, and creates a new batch. A batch
 * records where its photos came from and what the supplier allowed before
 * anything can be uploaded; photos from a batch without public display
 * permission can be matched but never published.
 * API: artifacts/api-server/src/routes/bulk-images.ts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { formatDate } from '@/utils/format';

interface BatchSummary {
  total: number;
  awaitingMatching: number;
  awaitingReview: number;
  awaitingPublish: number;
  published: number;
  problems: number;
}
interface Batch {
  id: string;
  title: string;
  supplier_name: string;
  permission_public_display: boolean;
  created_at: string;
  summary: BatchSummary;
}

const BASES = [
  { key: 'own_photos', label: 'Our own photos' },
  { key: 'written_permission', label: 'Written permission' },
  { key: 'licence', label: 'Licence' },
  { key: 'other', label: 'Other' },
] as const;

export default function BulkImageBatchesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token;

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', supplierName: '', permissionBasis: 'own_photos', licence: '', permissionNotes: '',
    permissionPublicDisplay: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/bulk-images/batches`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) throw new Error('The bulk image matcher is not switched on for this server (staging only).');
      if (!res.ok) throw new Error(data.error ?? 'Could not load batches.');
      setBatches(data.batches);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load batches.');
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!token) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/bulk-images/batches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not create the batch.');
      router.push(`/admin/bulk-images/${data.batch.id}` as Href);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not create the batch.');
    } finally {
      setSaving(false);
    }
  };

  const input = [styles.input, { borderColor: colors.homeLine, color: colors.homeInk, backgroundColor: colors.homeSurface }];

  return (
    <>
      <Stack.Screen options={{ title: 'Bulk Image Matcher' }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text style={[styles.lead, { color: colors.homeMuted }]}>
          Upload photos of individual pins, confirm the suggested catalogue match, clean them with Pixian and
          publish them as catalogue images.
        </Text>

        {!showForm ? (
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.homeCoral }]} onPress={() => setShowForm(true)}>
            <Feather name="plus" size={16} color={colors.homeHeroText} />
            <Text style={[styles.primaryLabel, { color: colors.homeHeroText }]}>New batch</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <Text style={[styles.h2, { color: colors.homeInk }]}>New batch</Text>
            <Text style={[styles.label, { color: colors.homeInk }]}>Title</Text>
            <TextInput style={input} value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))}
              placeholder="e.g. Paris trip, November" placeholderTextColor={colors.homeMuted} />
            <Text style={[styles.label, { color: colors.homeInk }]}>Who supplied the photos?</Text>
            <TextInput style={input} value={form.supplierName} onChangeText={(supplierName) => setForm((f) => ({ ...f, supplierName }))}
              placeholder="Name of the photographer or collector" placeholderTextColor={colors.homeMuted} />
            <Text style={[styles.label, { color: colors.homeInk }]}>Permission basis</Text>
            <View style={styles.chips}>
              {BASES.map((b) => {
                const on = form.permissionBasis === b.key;
                return (
                  <Pressable key={b.key} onPress={() => setForm((f) => ({ ...f, permissionBasis: b.key }))}
                    style={[styles.chip, { borderColor: on ? colors.homeCoral : colors.homeLine, backgroundColor: on ? colors.homeAqua : 'transparent' }]}>
                    <Text style={{ color: colors.homeInk, fontFamily: 'Inter_500Medium', fontSize: 13 }}>{b.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.label, { color: colors.homeInk }]}>Licence (optional)</Text>
            <TextInput style={input} value={form.licence} onChangeText={(licence) => setForm((f) => ({ ...f, licence }))}
              placeholder="e.g. Perpetual, non-exclusive catalogue use" placeholderTextColor={colors.homeMuted} />
            <Text style={[styles.label, { color: colors.homeInk }]}>Notes (optional)</Text>
            <TextInput style={[...input, { minHeight: 60 }]} multiline value={form.permissionNotes}
              onChangeText={(permissionNotes) => setForm((f) => ({ ...f, permissionNotes }))}
              placeholder="Where the permission is recorded (email date, agreement…)" placeholderTextColor={colors.homeMuted} />
            <View style={styles.switchRow}>
              <Switch value={form.permissionPublicDisplay}
                onValueChange={(permissionPublicDisplay) => setForm((f) => ({ ...f, permissionPublicDisplay }))} />
              <Text style={[styles.switchLabel, { color: colors.homeInk }]}>
                The supplier allows these photos to be shown publicly in PinHunt
              </Text>
            </View>
            {!form.permissionPublicDisplay && (
              <Text style={[styles.note, { color: colors.wanted }]}>
                Without this, photos can be matched but not published.
              </Text>
            )}
            {formError && <Text style={[styles.note, { color: colors.destructive }]}>{formError}</Text>}
            <View style={styles.row}>
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.homeLine }]} onPress={() => setShowForm(false)}>
                <Text style={{ color: colors.homeInk, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 1, backgroundColor: colors.homeCoral }]} onPress={create} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.homeHeroText} /> :
                  <Text style={[styles.primaryLabel, { color: colors.homeHeroText }]}>Create batch</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.homeCoral} /> : error ? (
          <Text style={[styles.note, { color: colors.destructive, marginTop: 16 }]}>{error}</Text>
        ) : batches.length === 0 ? (
          <Text style={[styles.note, { color: colors.homeMuted, marginTop: 16 }]}>No batches yet.</Text>
        ) : batches.map((b) => (
          <TouchableOpacity key={b.id} onPress={() => router.push(`/admin/bulk-images/${b.id}` as Href)}
            style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.h2, { color: colors.homeInk, flex: 1 }]} numberOfLines={1}>{b.title}</Text>
              <Feather name="chevron-right" size={18} color={colors.homeMuted} />
            </View>
            <Text style={[styles.meta, { color: colors.homeMuted }]}>
              {b.supplier_name} · {formatDate(b.created_at, 'medium')}
              {b.permission_public_display ? '' : ' · not publishable'}
            </Text>
            <Text style={[styles.meta, { color: colors.homeInk }]}>
              {b.summary.total} photos · {b.summary.awaitingMatching} matching · {b.summary.awaitingReview} to review ·{' '}
              {b.summary.awaitingPublish} to publish · {b.summary.published} published
              {b.summary.problems ? ` · ${b.summary.problems} need attention` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: Platform.OS === 'web' ? 32 : 48, maxWidth: 900, width: '100%', alignSelf: 'center' },
  lead: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
  h2: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  switchLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  note: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primary: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  primaryLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
});
