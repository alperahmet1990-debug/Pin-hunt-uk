/**
 * ScrollView that remembers its offset in a shared store, so a list keeps its
 * place when its tab is left and re-entered (RR-20).
 */
import React, { useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

interface KeepScrollViewProps extends ScrollViewProps {
  /** Shared across tabs: offsets keyed by `id`. */
  store: React.MutableRefObject<Record<string, number>>;
  id: string;
}

export function KeepScrollView({ store, id, onScroll, onContentSizeChange, ...rest }: KeepScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const restored = useRef(false);
  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={16}
      {...rest}
      onScroll={e => {
        store.current[id] = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      onContentSizeChange={(w, h) => {
        if (!restored.current) {
          restored.current = true;
          const y = store.current[id];
          if (y) ref.current?.scrollTo({ y, animated: false });
        }
        onContentSizeChange?.(w, h);
      }}
    />
  );
}
