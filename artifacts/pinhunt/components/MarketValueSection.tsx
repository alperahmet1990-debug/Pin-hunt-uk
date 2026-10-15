import React, { useEffect, useState } from 'react';
import {
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
import { radius as themeRadius, spacing } from '@/constants/theme';

import { API_BASE } from '@/lib/apiBase';
import { confidentUkEstimate, type Confidence } from '@/utils/ukValuation';

// ─── Types (mirror api-server valuation service) ─────────────────────────────

type Marketplace = 'EBAY_GB' | 'EBAY_US';

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

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  return `updated ${days} days ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MarketValueSectionProps {
  pinId: string;
  /** When true, renders without its own outer card chrome so it can nest inside ValueDisplay's single card. */
  embedded?: boolean;
}

/**
 * "Typical UK price" from eBay asking prices (B-P1-19). Renders nothing
 * unless the GB estimate is confident and backed by GB listings — no US
 * figure and no manual refresh. Read-only: it never triggers an eBay search.
 */
export function MarketValueSection({ pinId, embedded = false }: MarketValueSectionProps) {
  const colors = useColors();
  const { session } = useAuth();
  const [data, setData] = useState<MarketValuePayload | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const headers: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    fetch(`${API_BASE}/pins/${encodeURIComponent(pinId)}/market-value`, { headers })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: MarketValuePayload) => { if (!cancelled) setData(payload); })
      // No price is better than an error box here; the section just stays hidden.
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId]);

  const estimate = data ? confidentUkEstimate(data.estimates ?? [], data.comparables ?? []) : null;
  if (!estimate || estimate.estimatedLow == null || estimate.estimatedHigh == null) return null;

  const comparables = (data?.comparables ?? []).filter(c => c.marketplace === 'EBAY_GB').slice(0, 5);
  const range = estimate.estimatedLow === estimate.estimatedHigh
    ? formatMoney(estimate.estimatedLow, estimate.currency)
    : `${formatMoney(estimate.estimatedLow, estimate.currency)}–${formatMoney(estimate.estimatedHigh, estimate.currency)}`;

  const cardStyle = [
    styles.card,
    embedded
      ? styles.cardEmbedded
      : { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: themeRadius.lg, borderWidth: 1 },
  ];

  return (
    <View style={cardStyle}>
      {embedded && <View style={[styles.divider, { backgroundColor: colors.homeLine }]} />}
      <View style={styles.priceBlock}>
        <Text style={[styles.priceLabel, { color: colors.homeMuted }]}>Typical UK price</Text>
        <Text style={[styles.price, { color: colors.homeInk }]}>{range}</Text>
        <Text style={[styles.subText, { color: colors.homeMuted }]}>
          eBay asking prices · {estimate.comparableCount} UK {estimate.comparableCount === 1 ? 'listing' : 'listings'} · {formatUpdated(estimate.calculatedAt)}
        </Text>
      </View>
      <Text style={[styles.explain, { color: colors.homeMuted }]}>
        Current asking prices on eBay UK, not sold prices. What a pin sells or trades for may differ.
      </Text>

      {estimate.stale && (
        <View style={[styles.staleBanner, { backgroundColor: colors.homeWarmSurface }]}>
          <Feather name="clock" size={12} color={colors.homeSandInk} />
          <Text style={[styles.staleText, { color: colors.homeSandInk }]}>
            These prices may be out of date.
          </Text>
        </View>
      )}

      {comparables.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded(e => !e)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={styles.expandToggle}
          >
            <Text style={[styles.expandLabel, { color: colors.homeInk }]}>
              See the eBay UK listings
            </Text>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.homeInk} />
          </TouchableOpacity>

          {expanded && comparables.map(item => (
            <TouchableOpacity
              key={item.ebayItemId}
              activeOpacity={0.8}
              onPress={() => item.itemUrl && Linking.openURL(item.itemUrl)}
              accessibilityRole="link"
              style={[styles.compRow, { borderColor: colors.homeLine }]}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.compImage} />
              ) : (
                <View style={[styles.compImage, { backgroundColor: colors.homeAqua }]} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.compTitle, { color: colors.homeInk }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.itemPrice != null && (
                  <Text style={[styles.compMeta, { color: colors.homeMuted }]}>
                    Asking {formatMoney(item.itemPrice, item.currency ?? estimate.currency)}
                  </Text>
                )}
                <Text style={[styles.compMeta, { color: colors.homeMuted }]}>
                  {item.condition ?? 'Condition not stated'} · External eBay listing
                </Text>
              </View>
              <Feather name="external-link" size={14} color={colors.homeMuted} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: spacing.md },
  cardEmbedded: { padding: 0, gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth },
  priceBlock: { gap: 2 },
  priceLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  price: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  explain: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
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
  expandToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44 },
  expandLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
