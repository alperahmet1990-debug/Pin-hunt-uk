/**
 * The signed-in collector's catalogue photo gaps (UX-056, #208), only for
 * people who can use photo contributions (`catalogue_contributions` flag:
 * contributors during the beta). For everyone else `enabled` is false and
 * nothing is loaded.
 */
import { useMemo } from 'react';
import { useFeature } from '@/hooks/useFeature';
import { useCatalogueCoverage } from '@/hooks/useCatalogueCoverage';
import { useCollection } from '@/context/CollectionContext';
import { photoGaps } from '@/utils/photoGaps';

export function usePhotoGaps(onlyIds?: string[]) {
  const { enabled, loading: featureLoading } = useFeature('catalogue_contributions');
  const { rows, loading, error, refresh } = useCatalogueCoverage(enabled);
  const { collection } = useCollection();
  const ownedIds = useMemo(() => new Set(
    Object.values(collection)
      .filter(e => e.status === 'owned' || e.status === 'for_trade')
      .map(e => e.pinId),
  ), [collection]);
  const onlyKey = onlyIds?.join(',');
  const gaps = useMemo(
    () => photoGaps(rows, ownedIds, onlyKey ? onlyKey.split(',') : undefined),
    [rows, ownedIds, onlyKey],
  );
  return { enabled, loading: featureLoading || loading, error, refresh, ...gaps };
}
