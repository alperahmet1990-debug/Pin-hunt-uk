/**
 * Admin Dashboard — entry point for the admin area.
 * Shows submission queue counts and quick-access links.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { createSupabasePinRepository, type MissingImageCounts } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface QueueCounts {
  submitted: number;
  under_review: number;
  total: number;
}

export default function AdminIndexScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();

  const pinRepo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  const [counts, setCounts]     = useState<QueueCounts | null>(null);
  const [imageCounts, setImageCounts] = useState<MissingImageCounts | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const [all, imgCounts] = await Promise.all([
        repo.getAllPinSubmissions(),
        pinRepo ? pinRepo.countMissingImages().catch(() => null) : Promise.resolve(null),
      ]);
      setCounts({
        submitted:    all.filter(s => s.status === 'submitted').length,
        under_review: all.filter(s => s.status === 'under_review').length,
        total:        all.length,
      });
      setImageCounts(imgCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, pinRepo]);

  // Reload on focus so counts refresh after a backfill session.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <Stack.Screen options={{ title: 'Admin' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, gap: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.adminBadge, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="shield" size={14} color={colors.primary} />
            <Text style={[styles.adminBadgeLabel, { color: colors.primary }]}>Admin Area</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Catalogue Management</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Review community submissions and manage the pin catalogue.
          </Text>
        </View>

        {/* Queue summary */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30', borderRadius: 12 }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : counts ? (
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <Text style={[styles.summaryTitle, { color: colors.mutedForeground }]}>SUBMISSION QUEUE</Text>
            <View style={styles.summaryRow}>
              <CountPill label="Awaiting Review" count={counts.submitted}    color="#3B82F6" />
              <CountPill label="Under Review"    count={counts.under_review} color="#F59E0B" />
              <CountPill label="Total"           count={counts.total}        color={colors.mutedForeground} />
            </View>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.sectionLabel}>
          <Text style={[styles.sectionLabelText, { color: colors.mutedForeground }]}>ACTIONS</Text>
        </View>

        <ActionCard
          icon="inbox"
          title="Review Submissions"
          description="Approve, reject, or request changes on community-submitted pins."
          badge={counts?.submitted && counts.submitted > 0 ? counts.submitted : undefined}
          onPress={() => router.push('/admin/submissions' as any)}
          colors={colors}
        />
        <ActionCard
          icon="book-open"
          title="Catalogue"
          description="Search and edit existing catalogue records."
          onPress={() => router.push('/admin/catalogue' as any)}
          colors={colors}
        />
        <ActionCard
          icon="upload-cloud"
          title="Catalogue Import"
          description="Bulk-load pins from an Excel workbook with dry-run preview and rollback."
          onPress={() => router.push('/admin/import' as any)}
          colors={colors}
        />
        <ActionCard
          icon="flag"
          title="Community Moderation"
          description="Scan recent community posts and remove inappropriate content."
          onPress={() => router.push('/admin/community-moderation' as any)}
          colors={colors}
        />
        <ActionCard
          icon="image"
          title="Image Backfill"
          description={
            imageCounts && imageCounts.missingAny > 0
              ? `${imageCounts.missingFront.toLocaleString()} front and ${imageCounts.missingBack.toLocaleString()} back images still missing across ${imageCounts.missingAny.toLocaleString()} pins.`
              : imageCounts && imageCounts.totalPins > 0
                ? 'All catalogue pins have images — nothing left to backfill.'
                : 'Add missing front or back photos to imported pins — paste a URL or upload directly.'
          }
          badge={imageCounts && imageCounts.missingAny > 0 ? imageCounts.missingAny : undefined}
          progress={
            imageCounts && imageCounts.totalPins > 0
              ? (imageCounts.totalPins - imageCounts.missingAny) / imageCounts.totalPins
              : undefined
          }
          onPress={() => router.push('/admin/image-backfill' as any)}
          colors={colors}
        />
        <ActionCard
          icon="search"
          title="eBay Image Dry Run"
          description="Test whether eBay can supply fallback images for pins with no photo. Report only."
          onPress={() => router.push('/admin/ebay-image-dryrun' as any)}
          colors={colors}
        />
        <ActionCard
          icon="check-square"
          title="Catalogue Validation"
          description="Check catalogue records against eBay listings and review suggested corrections. Nothing changes without your approval."
          onPress={() => router.push('/admin/catalogue-validation' as any)}
          colors={colors}
        />
        <ActionCard
          icon="eye"
          title="Vision Test"
          description="Proof of concept — upload a pin photo and see raw Google Cloud Vision results."
          onPress={() => router.push('/admin/vision-test' as any)}
          colors={colors}
        />
        <ActionCard
          icon="plus-circle"
          title="Add New Pin"
          description="Create a new catalogue entry directly."
          onPress={() => router.push({ pathname: '/admin/pin/[id]' as any, params: { id: 'new' } })}
          colors={colors}
          primary
        />
      </ScrollView>
    </>
  );
}

function CountPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillCount, { color }]}>{count}</Text>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

function ActionCard({
  icon, title, description, badge, progress, onPress, colors, primary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
  badge?: number;
  /** 0..1 — renders a completion bar under the description when provided. */
  progress?: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.actionCard,
        {
          backgroundColor: primary ? colors.primary : colors.card,
          borderColor:     primary ? colors.primary : colors.border,
          borderRadius: 14,
        },
      ]}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: primary ? 'rgba(255,255,255,0.18)' : colors.secondary, borderRadius: 10 }]}>
        <Feather name={icon} size={20} color={primary ? '#fff' : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, { color: primary ? '#fff' : colors.foreground }]}>{title}</Text>
        <Text style={[styles.actionDesc, { color: primary ? 'rgba(255,255,255,0.75)' : colors.mutedForeground }]} numberOfLines={2}>
          {description}
        </Text>
        {progress !== undefined && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: progress >= 1 ? '#22C55E' : colors.primary,
                    width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
              {Math.floor(Math.min(1, Math.max(0, progress)) * 100)}% complete
            </Text>
          </View>
        )}
      </View>
      {badge !== undefined && (
        <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
          <Text style={styles.badgeLabel}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Feather name="chevron-right" size={18} color={primary ? 'rgba(255,255,255,0.7)' : colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { alignItems: 'center', paddingVertical: 24 },
  header:          { gap: 6 },
  adminBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  adminBadgeLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  title:           { fontSize: 24, fontFamily: 'Inter_700Bold' },
  subtitle:        { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  errorBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
  errorText:       { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  summaryCard:     { padding: 16, borderWidth: 1, gap: 12 },
  summaryTitle:    { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-around' },
  pill:            { alignItems: 'center', gap: 2 },
  pillCount:       { fontSize: 24, fontFamily: 'Inter_700Bold' },
  pillLabel:       { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  sectionLabel:    { marginTop: 4 },
  sectionLabelText:{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  actionCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1 },
  actionIconWrap:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle:     { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  actionDesc:      { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  progressWrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressTrack:   { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: '100%', borderRadius: 3 },
  progressLabel:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  badge:           { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeLabel:      { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
