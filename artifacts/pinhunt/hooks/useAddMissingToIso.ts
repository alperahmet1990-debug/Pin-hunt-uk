/**
 * "Add missing to ISO" for a set (UX-021, #129): one batched setStatuses for
 * every missing pin not already on the ISO, with an Undo toast that puts
 * them back exactly (they had no status before).
 */
import { useCallback, useRef } from 'react';
import { useCollection } from '@/context/CollectionContext';
import { useToast } from '@/components/ui/Toast';
import { pinsToAddToIso } from '@/utils/setTraders';

export function useAddMissingToIso() {
  const { collection, setStatuses } = useCollection();
  const toast = useToast();
  // Undo runs later, so read the latest setter rather than this render's.
  const setStatusesRef = useRef(setStatuses);
  setStatusesRef.current = setStatuses;

  const pending = useCallback(
    (missingPinIds: string[]) => pinsToAddToIso(missingPinIds, id => collection[id]?.status),
    [collection],
  );

  const add = useCallback((missingPinIds: string[]) => {
    const ids = pinsToAddToIso(missingPinIds, id => collection[id]?.status);
    if (ids.length === 0) {
      toast.show({ message: 'Those pins are already on your ISO' });
      return 0;
    }
    setStatuses(ids, 'wanted');
    toast.show({
      message: `Added ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} to your ISO`,
      action: { label: 'Undo', onPress: () => setStatusesRef.current(ids, 'none') },
    });
    return ids.length;
  }, [collection, setStatuses, toast]);

  return { add, pending };
}
