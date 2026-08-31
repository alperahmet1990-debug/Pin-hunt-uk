import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

import { API_BASE } from '@/lib/apiBase';

// ─── Types (mirror api-server valuation service) ─────────────────────────────

type Marketplace = 'EBAY_GB' | 'EBAY_US';
type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

interface MarketEstimate {
  marketplace: Marketplace;
  currency: string;
  estimatedLow: number | null;
  estimatedMid: number | null;
  estimatedHigh: number | null;
  comparableCount: number;
  confidence: Confidence;
  calculatedAt: string;
  expiresAt: string;
  stale: boolean;
}

interface ComparableListing {
  ebayItemId: string;
  marketplace: Marketplace;
  title: string;
  itemUrl: string | null;
  imageUrl: string | null;
  itemPrice: number | null;
  deliveryPrice: number | null;
  totalPrice: number | null;
  currency: string | null;
  condition: string | null;
}

interface MarketValuePayload {
  estimates: MarketEstimate[];
  comparables: ComparableListing[];
  ebayConfigured: boolean;
}

const MARKET_META: Record<Marketplace, { label: string; locale: string; currency: string }> = {
  EBAY_GB: { label: 'UK', locale: 'en-GB', currency: 'GBP' },
  EBAY_US: { label: 'US', locale: 'en-US', currency: 'USD' },
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: 'Insufficient data',
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

function formatMoney(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Last updated today';
  if (days === 1) return 'Last updated yesterday';
  return `Last updated ${days} days ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarketValueSection({ pinId }: { pinId: string }) {
  const colors = useColors();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<MarketValuePayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const authHeaders: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    fetch(`${API_BASE}/pins/${encodeURIComponent(pinId)}/market-value`, { headers: authHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: MarketValuePayload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setErrorMsg('Could not check for a saved value.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setErrorMsg(null);
    try {
      const resp = await fetch(
        `${API_BASE}/pins/${encodeURIComponent(pinId)}/market-value/refresh`,
        { method: 'POST', headers: authHeaders },
      );
      const payload = await resp.json();
      if (!resp.ok) {
        setErrorMsg(payload?.error ?? 'eBay is unavailable right now.');
      } else {
        setData(payload as MarketValuePayload);
      }
    } catch {
      setErrorMsg('eBay is unavailable right now. Any saved value is unchanged.');
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId, session?.access_token]);

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
  ];

  // ── Checking value ──
  if (loading) {
    return (
      <View style={cardStyle}>
        <View style={styles.checkingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.subText, { color: colors.mutedForeground }]}>Checking value…</Text>
        </View>
      </View>
    );
  }

  const estimates = data?.estimates ?? [];
  const hasValue = estimates.some(e => e.estimatedMid != null);
  const anyStale = estimates.some(e => e.stale);

  // ── No value yet ──
  if (estimates.length === 0) {
    return (
      <View style={cardStyle}>
        <Text style={[styles.explain, { color: colors.mutedForeground }]}>
          Based on comparable active eBay listings. Actual sale and trade values may vary.
        </Text>
        {errorMsg && <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>}
        <TouchableOpacity
          onPress={refresh}
          disabled={refreshing}
          activeOpacity={0.85}
          style={[styles.checkBtn, { backgroundColor: colors.primary, borderRadius: colors.radius - 2 }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="search" size={15} color={colors.primaryForeground} />
          )}
          <Text style={[styles.checkBtnLabel, { color: colors.primaryForeground }]}>
            {refreshing ? 'Checking eBay…' : 'Check eBay value'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Value available / insufficient / stale ──
  const comparablesFor = (m: Marketplace) =>
    (data?.comparables ?? []).filter(c => c.marketplace === m).slice(0, 5);

  return (
    <View style={cardStyle}>
      <Text style={[styles.explain, { color: colors.mutedForeground }]}>
        Estimated current eBay market value, based on comparable active eBay listings. Actual sale
        and trade values may vary.
      </Text>

      {(['EBAY_GB', 'EBAY_US'] as Marketplace[]).map(m => {
        const est = estimates.find(e => e.marketplace === m);
        if (!est) return null;
        const meta = MARKET_META[m];
        return (
          <View key={m} style={[styles.marketBlock, { borderTopColor: colors.border }]}>
            <View style={styles.marketHeader}>
              <Text style={[styles.marketLabel, { color: colors.foreground }]}>{meta.label}</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {CONFIDENCE_LABEL[est.confidence]}
              </Text>
            </View>
            {est.estimatedMid != null ? (
              <>
                <Text style={[styles.typical, { color: colors.foreground }]}>
                  Typical value: {formatMoney(est.estimatedMid, meta.locale, est.currency)}
                </Text>
                {est.estimatedLow != null && est.estimatedHigh != null && (
                  <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                    Estimated range: {formatMoney(est.estimatedLow, meta.locale, est.currency)}–
                    {formatMoney(est.estimatedHigh, meta.locale, est.currency)}
                  </Text>
                )}
                <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                  {est.comparableCount} comparable {est.comparableCount === 1 ? 'listing' : 'listings'} ·{' '}
                  {formatUpdated(est.calculatedAt)}
                </Text>
              </>
            ) : (
              <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                Not enough comparable eBay listings to estimate a value.
              </Text>
            )}
          </View>
        );
      })}

      {anyStale && (
        <View style={[styles.staleBanner, { backgroundColor: colors.secondary }]}>
          <Feather name="clock" size={12} color={colors.secondaryForeground} />
          <Text style={[styles.staleText, { color: colors.secondaryForeground }]}>
            This value is out of date — showing the last known estimate.
          </Text>
        </View>
      )}
      {errorMsg && <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>}

      <TouchableOpacity
        onPress={refresh}
        disabled={refreshing}
        activeOpacity={0.8}
        style={[styles.refreshBtn, { borderColor: colors.border, borderRadius: colors.radius - 2 }]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="refresh-cw" size={13} color={colors.primary} />
        )}
        <Text style={[styles.refreshLabel, { color: colors.primary }]}>
          {refreshing ? 'Refreshing…' : 'Refresh eBay value'}
        </Text>
      </TouchableOpacity>

      {hasValue && (data?.comparables?.length ?? 0) > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded(e => !e)}
            activeOpacity={0.75}
            style={styles.expandToggle}
          >
            <Text style={[styles.expandLabel, { color: colors.accent }]}>
              View comparable eBay listings
            </Text>
            <Feather
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.accent}
            />
          </TouchableOpacity>

          {expanded &&
            (['EBAY_GB', 'EBAY_US'] as Marketplace[]).map(m => {
              const items = comparablesFor(m);
              if (items.length === 0) return null;
              const meta = MARKET_META[m];
              return (
                <View key={`comp-${m}`} style={{ marginTop: 8 }}>
                  <Text style={[styles.compGroupLabel, { color: colors.mutedForeground }]}>
                    {meta.label} · eBay listings
                  </Text>
                  {items.map(item => (
                    <TouchableOpacity
                      key={item.ebayItemId}
                      activeOpacity={0.8}
                      onPress={() => item.itemUrl && Linking.openURL(item.itemUrl)}
                      style={[styles.compRow, { borderColor: colors.border }]}
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.compImage} />
                      ) : (
                        <View style={[styles.compImage, { backgroundColor: colors.secondary }]} />
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[styles.compTitle, { color: colors.foreground }]}
                          numberOfLines={2}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.compMeta, { color: colors.mutedForeground }]}>
                          {item.itemPrice != null &&
                            formatMoney(item.itemPrice, meta.locale, item.currency ?? meta.currency)}
                        </Text>
                        <Text style={[styles.compMeta, { color: colors.mutedForeground }]}>
                          {item.condition ?? 'Condition not stated'} · External eBay listing
                        </Text>
                      </View>
                      <Feather name="external-link" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 14, gap: 10 },
  checkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explain: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  checkBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  marketBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 3 },
  marketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  marketLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  metaText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  typical: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  subText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  staleText: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1 },
  errorText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderWidth: 1,
  },
  refreshLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  expandToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  expandLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  compGroupLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  compImage: { width: 44, height: 44, borderRadius: 6, resizeMode: 'cover' },
  compTitle: { fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 },
  compMeta: { fontSize: 10.5, fontFamily: 'Inter_400Regular' },
});
