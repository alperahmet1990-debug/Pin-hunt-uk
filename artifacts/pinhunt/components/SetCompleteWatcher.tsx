/**
 * Watches for a collector finishing a set (UX-023, #136) and shows the
 * celebration once per set per account. Only reacts to pins the collector
 * adds (CollectionContext.onPinsAdded), never to sync or sign-in loading.
 * Completion is judged against the full set, loaded with ensureCollections.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { CataloguePin } from '@workspace/pin-repository';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { SetCompleteSheet } from '@/components/SetCompleteSheet';
import { celebratedSetsKey, newlyCompletedSet } from '@/utils/setCompletion';

export function SetCompleteWatcher() {
  const router = useRouter();
  const { user } = useAuth();
  const { collection, onPinsAdded } = useCollection();
  const { pins, ensureCollections } = usePinCatalogue();
  const [pending, setPending] = useState<string[]>([]);
  const [celebrating, setCelebrating] = useState<{ name: string; pins: CataloguePin[] } | null>(null);
  // Null until loaded; a set finished before then waits in `pending`.
  const [celebrated, setCelebrated] = useState<Set<string> | null>(null);
  const key = celebratedSetsKey(user?.id);

  // Which sets this account has already celebrated.
  useEffect(() => {
    setCelebrated(null);
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then(raw => { if (!cancelled) setCelebrated(new Set(raw ? JSON.parse(raw) as string[] : [])); })
      .catch(() => { if (!cancelled) setCelebrated(new Set()); });
    return () => { cancelled = true; };
  }, [key]);

  // A pin was added: load its whole set, then check it below.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  useEffect(() => onPinsAdded?.(pinIds => {
    const byId = new Map(pinsRef.current.map(p => [p.id, p]));
    const names = [...new Set(pinIds.map(id => byId.get(id)?.collection).filter((n): n is string => !!n))];
    if (names.length === 0) return;
    ensureCollections(names)
      .catch(() => {})
      .finally(() => setPending(prev => [...new Set([...prev, ...names])]));
  }), [onPinsAdded, ensureCollections]);

  useEffect(() => {
    if (pending.length === 0 || celebrating || !celebrated) return;
    const done = newlyCompletedSet(pending, pins, collection, celebrated);
    setPending([]);
    if (!done) return;
    const next = new Set(celebrated).add(done.name);
    setCelebrated(next);
    AsyncStorage.setItem(key, JSON.stringify([...next])).catch(() => {});
    setCelebrating(done);
  }, [pending, pins, collection, celebrating, celebrated, key]);

  const close = useCallback(() => setCelebrating(null), []);
  return (
    <SetCompleteSheet
      set={celebrating}
      onClose={close}
      onViewSet={name => {
        setCelebrating(null);
        router.push({ pathname: '/set/[collection]', params: { collection: name } });
      }}
    />
  );
}
