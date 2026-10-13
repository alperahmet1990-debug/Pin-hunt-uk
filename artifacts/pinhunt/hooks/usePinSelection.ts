/**
 * Select mode for a pin grid (UX-022, #130): on/off, the selected ids, and
 * select-all over a given list. Kept separate from any screen so other grids
 * (board detail, collection bulk edit) can reuse it.
 */
import { useCallback, useMemo, useState } from 'react';

export function usePinSelection() {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => { setActive(false); setIds(new Set()); }, []);
  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  /** Select every id in `all`, or clear them if they're all selected already. */
  const toggleAll = useCallback((all: string[]) => {
    setIds(prev => {
      const allSelected = all.length > 0 && all.every(id => prev.has(id));
      const next = new Set(prev);
      for (const id of all) { if (allSelected) next.delete(id); else next.add(id); }
      return next;
    });
  }, []);
  const clear = useCallback(() => setIds(new Set()), []);

  return useMemo(() => ({
    active,
    selected: ids,
    count: ids.size,
    has: (id: string) => ids.has(id),
    allSelected: (all: string[]) => all.length > 0 && all.every(id => ids.has(id)),
    start,
    stop,
    toggle,
    toggleAll,
    clear,
  }), [active, ids, start, stop, toggle, toggleAll, clear]);
}
