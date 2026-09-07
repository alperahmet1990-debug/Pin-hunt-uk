/**
 * useFindTrades — loads and calculates the four Find Trades sections from
 * real collection/catalogue state. Network calls reuse existing repository
 * methods (getForTradeInventory, getPotentialTrades, getPinsBySeries,
 * getPinsByIds, getSetSummaries, getPublicProfile); the opportunity
 * calculations themselves live in utils/findTradesEngine so they can move
 * server-side later without touching this hook's shape.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMarketplace } from './useMarketplace';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useBoards } from '@/context/BoardsContext';
import {
  buildDiscoveryItems,
  deriveInterestKeywords,
  groupInventoryByPin,
  rankReciprocalCandidates,
  type CollectionInterest,
  type DiscoveryItem,
  type PinOpportunity,
} from '@/utils/findTradesEngine';
import type { PublicProfile } from '@workspace/pin-repository';

export interface SetOpportunity {
  setName: string;
  ownedCount: number;
  totalCount: number;
  available: PinOpportunity[];
}

export interface PotentialTradeCard {
  traderId: string;
  profile: PublicProfile | null;
  theyHaveCount: number;
  iHaveCount: number;
  samplePins: { title: string; imageUrl?: string }[];
}

export interface FindTradesData {
  isoOpportunities: PinOpportunity[];
  /** Trader ids that also want something the viewer has for trade — drives the ISO "MATCH" badge. */
  reciprocalTraderIds: Set<string>;
  potentialTrades: PotentialTradeCard[];
  setOpportunities: SetOpportunity[];
  discoveryItems: DiscoveryItem[];
  discoveryInterests: CollectionInterest[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Boards below this size are too thin to count as a genuine collecting interest. */
const MIN_INTEREST_BOARD_SIZE = 5;
const MAX_INTEREST_BOARDS = 2;
const MAX_POTENTIAL_TRADE_CARDS = 3;
const MAX_SET_CARDS = 2;

export function useFindTrades(): FindTradesData {
  const { repo, userId } = useMarketplace();
  const { collection } = useCollection();
  const { repository: catRepo } = usePinCatalogue();
  const { customBoards } = useBoards();

  const [isoOpportunities, setIsoOpportunities] = useState<PinOpportunity[]>([]);
  const [reciprocalTraderIds, setReciprocalTraderIds] = useState<Set<string>>(new Set());
  const [potentialTrades, setPotentialTrades] = useState<PotentialTradeCard[]>([]);
  const [setOpportunities, setSetOpportunities] = useState<SetOpportunity[]>([]);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryItem[]>([]);
  const [discoveryInterests, setDiscoveryInterests] = useState<CollectionInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!repo || !userId || !catRepo) { setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        const entries = Object.entries(collection);
        const wantedIds = entries.filter(([, e]) => e.status === 'wanted').map(([id]) => id);
        const ownedOrTradeIds = entries.filter(([, e]) => e.status === 'owned' || e.status === 'for_trade').map(([id]) => id);
        const allHandledIds = new Set(entries.map(([id]) => id));

        // ── 1. On Your ISO ──────────────────────────────────────────────────
        const isoInventory = wantedIds.length ? await repo.getForTradeInventory({ viewerId: userId, pinIds: wantedIds }) : [];
        const isoGrouped = groupInventoryByPin(isoInventory);

        // ── 2. Potential trades — scan only collectors already surfaced by ISO ──
        const candidateTraderIds = [...new Set(isoInventory.map(i => i.traderId))];
        const candidateResults = await Promise.all(candidateTraderIds.map(async traderId => {
          const rows = await repo.getPotentialTrades({ viewerId: userId, collectorId: traderId });
          return {
            traderId,
            theyHaveCount: rows.filter(r => r.direction === 'they_have_i_want').length,
            iHaveCount: rows.filter(r => r.direction === 'i_have_they_want').length,
          };
        }));
        const reciprocalIds = new Set(
          candidateResults.filter(c => c.theyHaveCount > 0 && c.iHaveCount > 0).map(c => c.traderId),
        );
        const rankedReciprocal = rankReciprocalCandidates(candidateResults).slice(0, MAX_POTENTIAL_TRADE_CARDS);
        const potentialTradeCards = await Promise.all(rankedReciprocal.map(async r => {
          const username = isoInventory.find(i => i.traderId === r.traderId)?.traderUsername;
          const profile = username ? await repo.getPublicProfile(username) : null;
          const samplePins = isoInventory
            .filter(i => i.traderId === r.traderId)
            .slice(0, 2)
            .map(i => ({ title: i.title, imageUrl: i.imageUrl }));
          return { traderId: r.traderId, profile, theyHaveCount: r.theyHaveCount, iHaveCount: r.iHaveCount, samplePins };
        }));

        // ── 3. Complete Your Sets ───────────────────────────────────────────
        const ownedPinDetails = ownedOrTradeIds.length ? await catRepo.getPinsByIds(ownedOrTradeIds) : [];
        const ownedByCollection = new Map<string, Set<string>>();
        for (const p of ownedPinDetails) {
          if (!p.collection) continue;
          if (!ownedByCollection.has(p.collection)) ownedByCollection.set(p.collection, new Set());
          ownedByCollection.get(p.collection)!.add(p.id);
        }
        const summaries = await catRepo.getSetSummaries();
        const summaryNames = new Set(summaries.map(s => s.setName));
        const inProgressNames = [...ownedByCollection.keys()].filter(name => summaryNames.has(name));
        const setCandidates = await Promise.all(inProgressNames.map(async name => {
          const allSetPins = await catRepo.getPinsBySeries(name);
          const owned = ownedByCollection.get(name)!;
          const missing = allSetPins.filter(p => !owned.has(p.id));
          if (missing.length === 0 || allSetPins.length === 0) return null;
          return { setName: name, ownedCount: owned.size, totalCount: allSetPins.length, missingPinIds: missing.map(p => p.id) };
        }));
        const inProgressSets = setCandidates
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .sort((a, b) => b.ownedCount - a.ownedCount)
          .slice(0, MAX_SET_CARDS);
        const setOps = await Promise.all(inProgressSets.map(async s => {
          const availInventory = await repo.getForTradeInventory({ viewerId: userId, pinIds: s.missingPinIds });
          return { setName: s.setName, ownedCount: s.ownedCount, totalCount: s.totalCount, available: groupInventoryByPin(availInventory) };
        }));

        // ── 4. Based on Your Collection ─────────────────────────────────────
        const bigBoards = customBoards
          .filter(b => b.pinIds.length >= MIN_INTEREST_BOARD_SIZE)
          .sort((a, b) => b.pinIds.length - a.pinIds.length)
          .slice(0, MAX_INTEREST_BOARDS);
        let interests: CollectionInterest[] = [];
        if (bigBoards.length) {
          const boardPinSets = await Promise.all(bigBoards.map(b => catRepo.getPinsByIds(b.pinIds)));
          interests = bigBoards
            .map((b, i) => ({ label: b.name, keywords: deriveInterestKeywords(boardPinSets[i]) }))
            .filter(interest => interest.keywords.length > 0);
        }
        if (interests.length === 0 && ownedPinDetails.length > 0) {
          const keywords = deriveInterestKeywords(ownedPinDetails);
          if (keywords.length) interests = [{ label: 'your collection', keywords }];
        }

        let discovery: DiscoveryItem[] = [];
        if (interests.length > 0) {
          const excludeIds = new Set([...allHandledIds, ...isoGrouped.map(o => o.pinId)]);
          const allForTrade = await repo.getForTradeInventory({ viewerId: userId, limit: 500 });
          discovery = buildDiscoveryItems(allForTrade, interests, excludeIds);
        }

        if (cancelled) return;
        setIsoOpportunities(isoGrouped);
        setReciprocalTraderIds(reciprocalIds);
        setPotentialTrades(potentialTradeCards);
        setSetOpportunities(setOps);
        setDiscoveryItems(discovery);
        setDiscoveryInterests(interests);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Find Trades.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, userId, catRepo, refreshToken]);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  return {
    isoOpportunities,
    reciprocalTraderIds,
    potentialTrades,
    setOpportunities,
    discoveryItems,
    discoveryInterests,
    loading,
    error,
    refresh,
  };
}
