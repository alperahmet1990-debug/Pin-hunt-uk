/**
 * The signed-in collector's catalogue photo gaps (UX-056, #208), only for
 * people who can use photo contributions (`catalogue_contributions` flag:
 * contributors during the beta). For everyone else `enabled` is false and
 * nothing is loaded.
 *
 * Only the collector's own pins (owned or For Trade) are looked up, not the
 * whole catalogue.
 */
import { useMemo } from 'react';
import { useFeature } from '@/hooks/useFeature';
import { useCoverageFor } from '@/hooks/useCatalogueCoverage';
import { useCollection } from '@/context/CollectionContext';
import { photoGaps } from '@/utils/photoGaps';

export function usePhotoGaps(onlyIds?: string[]) {
  const { enabled, loading: featureLoading } = useFeature('catalogue_contributions');
  const { collection } = useCollection();
  const ownedList = useMemo(() => Object.values(collection)
    .filter(e => e.status === 'owned' || e.status === 'for_trade')
    .map(e => e.pinId)
    .sort(), [collection]);
  const ownedIds = useMemo(() => new Set(ownedList), [ownedList]);
  const onlyKey = onlyIds?.join(',');
  const lookUp = useMemo(
    () => (onlyKey ? ownedList.filter(id => onlyKey.split(',').includes(id)) : ownedList),
    [ownedList, onlyKey],
  );
  const { rows, loading, error, refresh } = useCoverageFor(enabled, lookUp);
  const gaps = useMemo(
    () => photoGaps(rows, ownedIds, onlyKey ? onlyKey.split(',') : undefined),
    [rows, ownedIds, onlyKey],
  );
  return { enabled, loading: featureLoading || loading, error, refresh, ...gaps };
}
