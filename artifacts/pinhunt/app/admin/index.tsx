/**
 * Admin Home — "Needs Attention".
 * Answers one question first: what needs the admin's attention right now.
 * Quick Access below links to the day-to-day admin workflows that are kept
 * in the normal Admin navigation (developer/data-engineering tools are not
 * linked from here — see app/admin/_layout.tsx for the full route list).
 */
import React, { useCallback, useState } from 'react';
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

interface AttentionCounts {
  reportedContent: number;
  pendingSubmissions: number;
}

export default function AdminIndexScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();

  const [counts, setCounts]         = useState<AttentionCounts | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const [reportedPosts, reportedComments, submissions] = await Promise.all([
        repo.getPostReportSummaries(),
        repo.getReportedComments(),
        repo.getAllPinSubmissions(),
      ]);
      setCounts({
        reportedContent: reportedPosts.length + reportedComments.length,
        pendingSubmissions: submissions.filter(
          s => s.status === 'submitted' || s.status === 'under_review',
        ).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo]);

  // Reload on focus so counts refresh after a moderation/review session.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalAttention = (counts?.reportedContent ?? 0) + (counts?.pendingSubmissions ?? 0);

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
            <Text style={[styles.adminBadgeLabel, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* Needs Attention */}
        <View style={styles.sectionLabel}>
          <Text style={[styles.sectionLabelText, { color: colors.mutedForeground }]}>NEEDS ATTENTION</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30', borderRadius: 12 }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : totalAttention === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <Feather name="check-circle" size={22} color="#22C55E" />
            <Text style={[styles.emptyText, { color: colors.foreground }]}>
              Nothing needs your attention right now.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {counts && counts.reportedContent > 0 && (
              <AttentionRow
                icon="flag"
                label="Reported content"
                count={counts.reportedContent}
                onPress={() => router.push('/admin/community-moderation' as any)}
                colors={colors}
              />
            )}
            {counts && counts.pendingSubmissions > 0 && (
              <AttentionRow
                icon="inbox"
                label="Pending submissions"
                count={counts.pendingSubmissions}
                onPress={() => router.push('/admin/submissions' as any)}
                colors={colors}
              />
            )}
          </View>
        )}

        {/* Quick access */}
        <View style={styles.sectionLabel}>
          <Text style={[styles.sectionLabelText, { color: colors.mutedForeground }]}>QUICK ACCESS</Text>
        </View>

        <ActionCard
          icon="flag"
          title="Community"
          description="Review reported posts and comments."
          onPress={() => router.push('/admin/community-moderation' as any)}
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
          icon="inbox"
          title="Catalogue Submissions"
          description="Review pins submitted by collectors before they're added."
          onPress={() => router.push('/admin/submissions' as any)}
          colors={colors}
        />
        <ActionCard
          icon="image"
          title="Missing Images"
          description="Add missing front or back photos to catalogue pins."
          onPress={() => router.push('/admin/image-backfill' as any)}
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

function AttentionRow({
  icon, label, count, onPress, colors,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  count: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.attentionRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}
    >
      <View style={[styles.attentionIconWrap, { backgroundColor: '#EF444418', borderRadius: 10 }]}>
        <Feather name={icon} size={18} color="#EF4444" />
      </View>
      <Text style={[styles.attentionLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
        <Text style={styles.badgeLabel}>{count > 99 ? '99+' : count}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function ActionCard({
  icon, title, description, onPress, colors, primary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
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
      </View>
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
  errorBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
  errorText:       { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  emptyCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderWidth: 1 },
  emptyText:       { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  sectionLabel:    { marginTop: 4 },
  sectionLabelText:{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  attentionRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  attentionIconWrap:{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  attentionLabel:  { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  actionCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1 },
  actionIconWrap:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle:     { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  actionDesc:      { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  badge:           { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeLabel:      { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
