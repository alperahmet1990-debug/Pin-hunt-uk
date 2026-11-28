/**
 * Recent sold prices for a pin, from eBay sold listings (valuation v2).
 *
 * Starts on the collector's home market (UK £ or US $); the other market is
 * a tap away. With no sold price yet it offers "Get a price", which asks the
 * server to check recent eBay sales for this pin, then shows a pending state
 * until the answer comes back (a price, or "no recent sales found").
 *
 * Renders nothing when the server has sold prices switched off. No
 * individual listings or links: those wait on the eBay terms review
 * (docs/release/LAUNCH-BLOCKERS.md, L1). The asking-price figures elsewhere
 * on the pin page stay as they are, labelled as asking prices.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { usePriceCurrency } from '@/hooks/usePriceCurrency';
import { useSoldPrices, type RequestError, type SoldMarket, type SoldValuation } from '@/hooks/useSoldPrices';
import { radius, spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/priceFormat';
import { formatDate } from '@/utils/format';

const MARKET_NAME: Record<SoldMarket, string> = { UK: 'eBay UK', US: 'eBay US' };
const MARKET_CHIP: Record<SoldMarket, string> = { UK: 'UK £', US: 'US $' };

const ERROR_TEXT: Record<RequestError, string> = {
  daily_limit: 'You’ve used today’s price checks. Try again tomorrow.',
  busy: 'Price checks are busy right now. Try again later.',
  unavailable: 'Price checks aren’t available right now.',
};

/** "eBay UK", "eBay UK and US"; falls back to both when the server didn't say. */
function searchedNames(markets: SoldMarket[]): string {
  const list = markets.length ? markets : (['UK', 'US'] as SoldMarket[]);
  return list.length === 1 ? MARKET_NAME[list[0]] : `eBay ${list.join(' and ')}`;
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return formatDate(iso, 'medium') || null;
}

export function SoldPriceCard({ pinId }: { pinId: string }) {
  const colors = useColors();
  // The shared session switch (same one as the VALUE card): GBP is UK, USD is US.
  const [currency, setCurrency, homeCurrency] = usePriceCurrency();
  const home: SoldMarket = homeCurrency === 'USD' ? 'US' : 'UK';
  const market: SoldMarket = currency === 'USD' ? 'US' : 'UK';
  const setMarket = (m: SoldMarket) => setCurrency(m === 'US' ? 'USD' : 'GBP');
  const data = useSoldPrices(pinId);

  if (data.status !== 'ready') return null;
  const { valuations, request, error, requestPrice } = data;
  const value = valuations.find(v => v.market === market) ?? null;
  const otherValue = value ? null : valuations.find(v => v.market !== market) ?? null;
  // Nothing to show and nothing to offer: keep the pin page as it was.
  if (valuations.length === 0 && !request.requestsOpen && request.state === 'none') return null;

  const markets: SoldMarket[] = home === 'US' ? ['US', 'UK'] : ['UK', 'US'];

  return (
    <View testID="sold-price-card" style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.homeMuted }]}>RECENT SOLD PRICES</Text>
        <View accessibilityRole="radiogroup" style={[styles.switch, { backgroundColor: colors.homeAqua }]}>
          {markets.map(m => {
            const on = m === market;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMarket(m)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={m === 'UK' ? 'UK sold prices, pounds' : 'US sold prices, dollars'}
                hitSlop={6}
                style={[styles.switchOption, on && { backgroundColor: colors.homeSurface }]}
              >
                <Text style={[styles.switchLabel, { color: on ? colors.homeInk : colors.homeMuted }]}>{MARKET_CHIP[m]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {value ? (
        <Priced value={value} />
      ) : request.state === 'pending' ? (
        <View testID="sold-price-pending" accessibilityLiveRegion="polite" style={styles.pending}>
          <ActivityIndicator color={colors.homeCoralDeep} />
          <View style={styles.flex}>
            <Text style={[styles.title, { color: colors.homeInk }]}>Checking recent sales…</Text>
            <Text style={[styles.body, { color: colors.homeMuted }]}>This can take a minute. You can leave this page.</Text>
          </View>
        </View>
      ) : request.state === 'no_sales' || request.state === 'priced' ? (
        <View testID="sold-price-none" style={styles.block}>
          <Text style={[styles.title, { color: colors.homeInk }]}>No recent sales found</Text>
          <Text style={[styles.body, { color: colors.homeMuted }]}>
            {request.markets.length > 0 && !request.markets.includes(market)
              ? `We don’t check ${MARKET_NAME[market]} sales yet.`
              : `We looked for this pin in ${MARKET_NAME[market]} sold listings${shortDate(request.checkedAt) ? ` on ${shortDate(request.checkedAt)}` : ''} and didn’t find enough recent sales to give a price.${shortDate(request.nextRequestAt) ? ` We can check again from ${shortDate(request.nextRequestAt)}.` : ''}`}
          </Text>
          {otherValue && (
            <TouchableOpacity onPress={() => setMarket(otherValue.market)} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.body, styles.link, { color: colors.homeCoralDeep }]}>
                {`${MARKET_NAME[otherValue.market]} has a sold price: see ${MARKET_CHIP[otherValue.market]}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View testID="sold-price-empty" style={styles.block}>
          <Text style={[styles.title, { color: colors.homeInk }]}>No sold price yet</Text>
          <Text style={[styles.body, { color: colors.homeMuted }]}>
            {request.requestsOpen
              ? `We can check recent ${searchedNames(request.markets)} sales for this pin.`
              : `No recent ${MARKET_NAME[market]} sales are recorded for this pin yet.`}
          </Text>
          {request.requestsOpen && (
            <TouchableOpacity
              onPress={requestPrice}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={[styles.cta, { backgroundColor: colors.homeCoral }]}
            >
              <Text style={[styles.ctaLabel, { color: colors.homeSurface }]}>Get a price</Text>
            </TouchableOpacity>
          )}
          {error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.homeSandInk }]}>{ERROR_TEXT[error]}</Text>}
        </View>
      )}
    </View>
  );
}

function Priced({ value }: { value: SoldValuation }) {
  const colors = useColors();
  const sales = `${value.soldCount} recent ${value.soldCount === 1 ? 'sale' : 'sales'}`;
  const fair = formatPrice(Math.round(value.fair), value.currency);
  const low = value.low != null ? formatPrice(Math.round(value.low), value.currency) : null;
  const high = value.high != null ? formatPrice(Math.round(value.high), value.currency) : null;
  return (
    <View
      testID="sold-price-priced"
      accessible
      accessibilityLabel={`Typical sold price ${fair}.${low && high ? ` Low ${low}, high ${high}.` : ''} Based on ${sales} on ${MARKET_NAME[value.market]}.`}
      style={styles.block}
    >
      <View style={styles.row}>
        <Stat label="Low" amount={low} muted />
        <Stat label="Fair" amount={fair} />
        <Stat label="High" amount={high} muted />
      </View>
      <Text style={[styles.body, { color: colors.homeInk }]}>
        Based on {sales} on {MARKET_NAME[value.market]}
      </Text>
      <Text style={[styles.note, { color: colors.homeMuted }]}>
        Sold prices from completed eBay sales by {value.market === 'US' ? 'US' : 'UK'} sellers, not asking prices.
      </Text>
    </View>
  );
}

function Stat({ label, amount, muted = false }: { label: string; amount: string | null; muted?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.homeMuted }]}>{label}</Text>
      <Text
        style={[muted ? styles.statSmall : styles.statBig, { color: muted ? colors.homeInk : colors.homeCoralDeep }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {amount ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kicker: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1, flexShrink: 1 },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  switchOption: { minHeight: 32, minWidth: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  switchLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  block: { gap: 6 },
  flex: { flex: 1, gap: 2 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, textTransform: 'uppercase' },
  statBig: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  statSmall: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  link: { fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 11.5, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  cta: { minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: 4 },
  ctaLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
