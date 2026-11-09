/**
 * Find them a home (#547): pins you have that don't have a place yet. Select
 * some (or all, or just the For Trade ones), then put them in a place in one
 * go. In a trade book they fill the free pockets from the page you choose.
 *
 * Wide screens (iPad landscape) keep the place picker beside the pins; phones
 * open it as a sheet.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { useOwnedPins } from '@/hooks/useOwnedPins';
import { usePinSelection } from '@/hooks/usePinSelection';
import { EmptyState } from '@/components/EmptyState';
import { Button, PinTile } from '@/components/ui';
import { pinGridColumns, pinTileSize, PIN_GRID_GUTTER } from '@/components/ui/PinGrid';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { LocationEditor } from '@/components/locations/LocationEditor';
import { hasSidePanel, SIDE_PANEL_WIDTH } from '@/utils/deviceLayout';
import { radius, spacing } from '@/constants/theme';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;
type Filter = 'all' | 'for_trade' | 'owned';

export default function FindThemAHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const loc = usePinLocations();
  const { pins } = useOwnedPins();
  const selection = usePinSelection();
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const side = hasSidePanel(width);
  const gridWidth = side ? width - SIDE_PANEL_WIDTH - 40 : width;
  const cols = pinGridColumns(gridWidth);
  const tile = pinTileSize(gridWidth, cols, spacing.lg);

  const homeless = useMemo(() => pins.filter(p => !loc.locations[p.pin.id]), [pins, loc.locations]);
  const shown = homeless.filter(p => filter === 'all' || p.status === filter);
  const selectedIds = [...selection.selected].filter(id => homeless.some(p => p.pin.id === id));

  const done = (message: string) => {
    selection.clear();
    setSheetOpen(false);
    toast.show({ message });
  };

  if (loc.status === 'off') {
    return (
      <>
        <Stack.Screen options={{ title: 'Find them a home' }} />
        <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
          <EmptyState icon="home" title="Not available yet" subtitle="Sign in to keep track of where your pins live." />
        </View>
      </>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={[styles.intro, { color: colors.homeMuted }]}>
        {homeless.length === 0
          ? 'Every pin you have has a place.'
          : `${pinsWord(homeless.length)} without a place. Select some, then choose where they go.`}
      </Text>
      {homeless.length > 0 && (
        <View style={styles.filters}>
          {(['all', 'for_trade', 'owned'] as const).map(f => {
            const on = filter === f;
            const label = f === 'all' ? 'All' : f === 'for_trade' ? 'For Trade' : 'Keepers';
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.filter, { borderColor: on ? colors.homeCoral : colors.homeLine, backgroundColor: on ? colors.homeAqua : colors.homeSurface }]}
              >
                <Text style={[styles.filterText, { color: on ? colors.homeCoralDeep : colors.homeInk }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => selection.toggleAll(shown.map(p => p.pin.id))}
            accessibilityRole="button"
            style={[styles.filter, { borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}
          >
            <Text style={[styles.filterText, { color: colors.homeCoralDeep }]}>
              {selection.allSelected(shown.map(p => p.pin.id)) ? 'Clear' : `Select ${shown.length}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const grid = (
    <FlatList
      style={{ flex: 1 }}
      data={shown}
      key={`home-grid-${cols}`}
      numColumns={cols}
      keyExtractor={p => p.pin.id}
      ListHeaderComponent={header}
      columnWrapperStyle={cols > 1 ? { gap: PIN_GRID_GUTTER, marginBottom: spacing.lg } : undefined}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 120 }}
      extraData={selection.selected}
      renderItem={({ item }) => (
        <View style={{ width: tile }}>
          <PinTile
            title={item.pin.title}
            imageUrl={item.pin.imageUrl}
            size={tile}
            status={item.status === 'for_trade' ? 'for_trade' : undefined}
            selected={selection.has(item.pin.id)}
            onPress={() => { if (!selection.active) selection.start(); selection.toggle(item.pin.id); }}
          />
        </View>
      )}
    />
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Find them a home' }} />
      <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
        {side ? (
          <View style={styles.row}>
            {grid}
            <View style={[styles.panel, { backgroundColor: colors.homeSurface, borderLeftColor: colors.homeLine }]}>
              {selectedIds.length > 0 ? (
                <LocationEditor key={selectedIds.join(',')} pinIds={selectedIds} onDone={done} />
              ) : (
                <View style={styles.panelEmpty}>
                  <Text style={[styles.panelTitle, { color: colors.homeInk }]}>Choose a place</Text>
                  <Text style={[styles.intro, { color: colors.homeMuted }]}>Tap pins to select them. Their new home shows here.</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <>
            {grid}
            {selectedIds.length > 0 && (
              <View style={[styles.bar, { backgroundColor: colors.homeSurface, borderTopColor: colors.homeLine, paddingBottom: insets.bottom + spacing.md }]}>
                <Button label={`Choose a place for ${pinsWord(selectedIds.length)}`} icon="home" onPress={() => setSheetOpen(true)} />
              </View>
            )}
          </>
        )}
      </View>
      {!side && (
        <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Choose a place">
          {sheetOpen && <LocationEditor pinIds={selectedIds} onDone={done} />}
        </Sheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  header: { paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  intro: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filter: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  filterText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  panel: { width: SIDE_PANEL_WIDTH + 40, borderLeftWidth: StyleSheet.hairlineWidth, padding: spacing.xl },
  panelEmpty: { gap: spacing.sm },
  panelTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
