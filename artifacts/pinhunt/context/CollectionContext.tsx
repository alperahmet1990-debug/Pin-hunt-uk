import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CollectionEntry, CollectionMap } from '@/types/collection';
import type { CollectionStatus } from '@/types/pin';
import { usePinCatalogue } from '@/context/PinCatalogueContext';

interface CollectionContextValue {
  collection: CollectionMap;
  setStatus: (pinId: string, status: CollectionStatus) => void;
  setNotes: (pinId: string, notes: string) => void;
  getEntry: (pinId: string) => CollectionEntry | undefined;
  counts: { owned: number; wanted: number; forTrade: number };
  recentlyViewed: string[];
  markViewed: (pinId: string) => void;
  estimatedValue: number;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

const STORAGE_KEY = '@pinhunt_collection_v1';
const VIEWED_KEY = '@pinhunt_viewed_v1';

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [collection, setCollection] = useState<CollectionMap>({});
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { ensurePins } = usePinCatalogue();

  // The catalogue context caches only a slice of the catalogue; pins in the
  // user's collection may fall outside it. Pull any missing ones in so the
  // Collection tab, boards, and home screen can always render them.
  useEffect(() => {
    if (!loaded) return;
    const ids = Object.keys(collection);
    if (ids.length > 0) void ensurePins(ids);
  }, [loaded, collection, ensurePins]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(VIEWED_KEY),
    ]).then(([colData, viewData]) => {
      if (colData) setCollection(JSON.parse(colData));
      if (viewData) setRecentlyViewed(JSON.parse(viewData));
      setLoaded(true);
    });
  }, []);

  const setStatus = useCallback((pinId: string, status: CollectionStatus) => {
    setCollection(prev => {
      const existing = prev[pinId];
      let next: CollectionMap;
      if (status === 'none') {
        next = { ...prev };
        delete next[pinId];
      } else {
        next = {
          ...prev,
          [pinId]: {
            pinId,
            status,
            notes: existing?.notes ?? '',
            dateAdded: existing?.dateAdded ?? new Date().toISOString(),
          },
        };
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setNotes = useCallback((pinId: string, notes: string) => {
    setCollection(prev => {
      const entry = prev[pinId];
      if (!entry) return prev;
      const next = { ...prev, [pinId]: { ...entry, notes } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getEntry = useCallback(
    (pinId: string) => collection[pinId],
    [collection],
  );

  const markViewed = useCallback((pinId: string) => {
    setRecentlyViewed(prev => {
      const next = [pinId, ...prev.filter(id => id !== pinId)].slice(0, 12);
      AsyncStorage.setItem(VIEWED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const entries = Object.values(collection);
  const counts = {
    owned: entries.filter(e => e.status === 'owned').length,
    wanted: entries.filter(e => e.status === 'wanted').length,
    forTrade: entries.filter(e => e.status === 'for_trade').length,
  };

  // Estimated value is computed by the calling screen from PINS + collection
  const estimatedValue = 0; // placeholder; real computation done in Collection screen

  if (!loaded) return null;

  return (
    <CollectionContext.Provider
      value={{
        collection,
        setStatus,
        setNotes,
        getEntry,
        counts,
        recentlyViewed,
        markViewed,
        estimatedValue,
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be inside CollectionProvider');
  return ctx;
}
