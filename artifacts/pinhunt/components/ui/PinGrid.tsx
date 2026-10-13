/**
 * PinGrid — the one pin grid (UX-043, #126). Columns follow the screen
 * width (3 up to tablet, 4 from 600 pt), with an 8 pt gutter, and the
 * FlatList is tuned for long lists. Screens render each cell with
 * `renderTile(item, tileSize)`, usually a PinTile.
 */
import React from 'react';
import { FlatList, Platform, StyleSheet, useWindowDimensions, View, type FlatListProps } from 'react-native';
import { spacing } from '@/constants/theme';

export const PIN_GRID_GUTTER = 8;

/** 3 columns on phones (≤430 pt and up to tablet width), 4 from 600 pt. */
export function pinGridColumns(width: number): number {
  return width >= 600 ? 4 : 3;
}

/** Tile edge for `columns` across `width`, after side padding and gutters. */
export function pinTileSize(width: number, columns = pinGridColumns(width), sidePadding: number = spacing.lg): number {
  return Math.floor((width - sidePadding * 2 - PIN_GRID_GUTTER * (columns - 1)) / columns);
}

type PinGridProps<T> = Omit<FlatListProps<T>, 'renderItem' | 'numColumns' | 'columnWrapperStyle'> & {
  renderTile: (item: T, tileSize: number) => React.ReactElement | null;
  /** Side padding of the grid (defaults to the screen gutter). */
  sidePadding?: number;
};

export function PinGrid<T>({ renderTile, sidePadding = spacing.lg, contentContainerStyle, ...rest }: PinGridProps<T>) {
  const { width } = useWindowDimensions();
  const columns = pinGridColumns(width);
  const size = pinTileSize(width, columns, sidePadding);
  return (
    <FlatList
      {...rest}
      // Changing column count needs a fresh list.
      key={`pin-grid-${columns}`}
      numColumns={columns}
      columnWrapperStyle={styles.row}
      contentContainerStyle={[{ paddingHorizontal: sidePadding }, contentContainerStyle]}
      renderItem={({ item }) => <View style={{ width: size }}>{renderTile(item, size)}</View>}
      initialNumToRender={columns * 5}
      maxToRenderPerBatch={columns * 4}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: PIN_GRID_GUTTER, marginBottom: spacing.lg },
});
