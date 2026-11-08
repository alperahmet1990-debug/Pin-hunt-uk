/**
 * Drag and drop for pins on wide screens (iPad: Collecting at home).
 *
 * In select mode, press and hold a pin (or click-drag on the web) and drag:
 * the whole selection travels as one stack and drops onto a target in the
 * Organise panel (For Trade, Owned, ISO, a board). Dropping does exactly what
 * tapping that target does, so Undo and the confirmations come for free.
 *
 * - PinDragProvider: owns the drop zones and the floating stack.
 * - useDropZone: makes a view a target; tells it when a stack is over it.
 * - DraggablePin: wraps a tile so it can start a drag.
 *
 * Drag state lives in a small store, not React state, so a moving finger
 * re-renders only the stack and the target under it, not the whole grid.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export interface DropRect { x: number; y: number; width: number; height: number }

/** The id of the zone containing (x, y), or null. Later zones win on overlap. */
export function zoneAt(zones: Array<{ id: string; rect: DropRect | undefined }>, x: number, y: number): string | null {
  let hit: string | null = null;
  for (const { id, rect } of zones) {
    if (!rect) continue;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) hit = id;
  }
  return hit;
}

type DragState = { ids: string[]; x: number; y: number; over: string | null } | null;

function createDragStore() {
  let state: DragState = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: DragState) => { state = next; listeners.forEach(l => l()); },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

type Zone = { ref: React.RefObject<View | null>; onDrop: React.MutableRefObject<() => void>; label: string; rect?: DropRect };

interface PinDragApi {
  store: ReturnType<typeof createDragStore>;
  register: (id: string, zone: Zone) => () => void;
  begin: (ids: string[], x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  cancel: () => void;
  labelFor: (id: string | null) => string | null;
  origin: React.MutableRefObject<{ x: number; y: number }>;
}

const PinDragContext = createContext<PinDragApi | null>(null);

const measure = (ref: React.RefObject<View | null>) => new Promise<DropRect | undefined>(resolve => {
  const node = ref.current;
  if (!node) { resolve(undefined); return; }
  node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
});

export function PinDragProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(createDragStore, []);
  const zones = useRef(new Map<string, Zone>());
  const rootRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });

  const hitTest = useCallback((x: number, y: number) =>
    zoneAt([...zones.current].map(([id, z]) => ({ id, rect: z.rect })), x, y), []);

  const api = useMemo<PinDragApi>(() => ({
    store,
    origin,
    register: (id, zone) => {
      zones.current.set(id, zone);
      return () => { zones.current.delete(id); };
    },
    begin: (ids, x, y) => {
      store.set({ ids, x, y, over: null });
      // Targets may have scrolled since they were laid out: measure now.
      Promise.all([
        measure(rootRef).then(r => { if (r) origin.current = { x: r.x, y: r.y }; }),
        ...[...zones.current.values()].map(z => measure(z.ref).then(r => { z.rect = r; })),
      ]).then(() => {
        const s = store.get();
        if (s) store.set({ ...s, over: hitTest(s.x, s.y) });
      });
    },
    move: (x, y) => {
      const s = store.get();
      if (!s) return;
      const over = hitTest(x, y);
      store.set({ ...s, x, y, over });
    },
    end: () => {
      const s = store.get();
      store.set(null);
      if (s?.over) zones.current.get(s.over)?.onDrop.current();
    },
    cancel: () => { if (store.get()) store.set(null); },
    labelFor: id => (id ? zones.current.get(id)?.label ?? null : null),
  }), [store, hitTest]);

  return (
    <PinDragContext.Provider value={api}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        {children}
        <DragStack />
      </View>
    </PinDragContext.Provider>
  );
}

function useDragState(api: PinDragApi | null): DragState {
  return useSyncExternalStore(
    api ? api.store.subscribe : noopSubscribe,
    api ? api.store.get : nullState,
    api ? api.store.get : nullState,
  );
}
const noopSubscribe = () => () => {};
const nullState = () => null;

/**
 * Makes a view a drop target. Put `ref` on the target's outer view.
 * `onDrop` is read at drop time, so it always sees the latest selection.
 */
export function useDropZone(id: string, label: string, onDrop: () => void) {
  const api = useContext(PinDragContext);
  const ref = useRef<View>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  useEffect(() => api?.register(id, { ref, onDrop: dropRef, label }), [api, id, label]);
  const drag = useDragState(api);
  return { ref, dragging: !!drag, isOver: drag?.over === id };
}

/** True while a stack of pins is being dragged. */
export function useIsDraggingPins(): boolean {
  return !!useDragState(useContext(PinDragContext));
}

interface DraggablePinProps {
  /** The ids to drag, worked out when the drag starts. */
  getIds: () => string[];
  /** Called as the drag starts (e.g. to select the pin under the finger). */
  onDragStart?: () => void;
  children: React.ReactNode;
}

/** Lets a tile start a drag. Outside a PinDragProvider it renders the tile as is. */
export function DraggablePin({ getIds, onDragStart, children }: DraggablePinProps) {
  const api = useContext(PinDragContext);
  const gesture = useMemo(() => {
    if (!api) return null;
    return Gesture.Pan()
      .runOnJS(true)
      // Touch: hold, then drag, so scrolling still works. Mouse: just drag.
      .activateAfterLongPress(Platform.OS === 'web' ? 0 : 300)
      .minDistance(Platform.OS === 'web' ? 6 : 0)
      .onStart(e => {
        onDragStart?.();
        api.begin(getIds(), e.absoluteX, e.absoluteY);
      })
      .onUpdate(e => api.move(e.absoluteX, e.absoluteY))
      .onEnd(() => api.end())
      .onFinalize(() => api.cancel());
  }, [api, getIds, onDragStart]);

  if (!api || !gesture) return <>{children}</>;
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

const STACK = 84;
/** The stack and its label travel in a box this wide, centred on the finger. */
const WRAP = 240;

function DragStack() {
  const api = useContext(PinDragContext);
  const drag = useDragState(api);
  const colors = useColors();
  if (!api || !drag) return null;
  const n = drag.ids.length;
  const target = api.labelFor(drag.over);
  const left = drag.x - api.origin.current.x - WRAP / 2;
  const top = drag.y - api.origin.current.y - STACK / 2;
  return (
    <View pointerEvents="none" style={[styles.stackWrap, { left, top }]}>
      <View style={[styles.card, styles.cardBack, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]} />
      <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral, shadowColor: colors.homeShadow }]}>
        <Feather name="layers" size={30} color={colors.homeCoralDeep} />
      </View>
      <View style={[styles.badge, { backgroundColor: colors.homeSand }]}>
        <Text style={[styles.badgeText, { color: colors.homeHeroText }]}>{n}</Text>
      </View>
      <View style={[styles.hint, { backgroundColor: colors.homeInk }]}>
        <Text style={[styles.hintText, { color: colors.homeBackground }]} numberOfLines={1}>
          {target ?? `${n} ${n === 1 ? 'pin' : 'pins'}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stackWrap: { position: 'absolute', width: WRAP, alignItems: 'center', zIndex: 1000 },
  card: {
    width: STACK, height: STACK, borderRadius: radius.md, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    transform: [{ rotate: '-4deg' }],
  },
  cardBack: { position: 'absolute', top: 4, left: (WRAP - STACK) / 2 + 6, transform: [{ rotate: '6deg' }], shadowOpacity: 0, elevation: 0 },
  badge: {
    position: 'absolute', top: -10, right: (WRAP - STACK) / 2 - 12, minWidth: 28, height: 28, borderRadius: 14,
    paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  hint: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, maxWidth: 240 },
  hintText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
