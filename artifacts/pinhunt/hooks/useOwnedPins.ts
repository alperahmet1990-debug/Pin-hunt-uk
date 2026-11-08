/**
 * The pins the collector has (owned or For Trade), resolved from the
 * catalogue and sorted by title. Used by the "where pins live" screens (#547).
 */
import { useEffect, useMemo } from 'react';
import type { CataloguePin } from '@workspace/pin-repository';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import type { CollectionStatus } from '@/types/pin';

export interface OwnedPin { pin: CataloguePin; status: CollectionStatus }

export function useOwnedPins(): { pins: OwnedPin[]; ids: string[] } {
  const { collection } = useCollection();
  const { pins: catalogue, ensurePins } = usePinCatalogue();
  const entries = useMemo(
    () => Object.values(collection).filter(e => e.status === 'owned' || e.status === 'for_trade'),
    [collection],
  );
  const ids = useMemo(() => entries.map(e => e.pinId), [entries]);
  const idsKey = ids.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ids.length) void ensurePins(ids); }, [idsKey, ensurePins]);
  const byId = useMemo(() => new Map(catalogue.map(p => [p.id, p])), [catalogue]);
  const pins = useMemo(
    () => entries
      .flatMap(e => { const pin = byId.get(e.pinId); return pin ? [{ pin, status: e.status }] : []; })
      .sort((a, b) => a.pin.title.localeCompare(b.pin.title)),
    [entries, byId],
  );
  return { pins, ids };
}
