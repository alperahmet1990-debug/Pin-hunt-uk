/**
 * A single-choice filter list in a bottom sheet (set, year, edition…), with
 * an "All …" row and optional search. Shared by Browse Catalogue and the
 * contributor screen (#396).
 */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Sheet } from '@/components/ui/Sheet';
import { radius, spacing } from '@/constants/theme';

export function FilterSheet({ visible, title, searchable, items, value, onSelect, onClose }: {
  visible: boolean;
  title: string;
  searchable: boolean;
  items: Array<{ value: string; label: string }>;
  value: string | null;
  onSelect(value: string | null): void;
  onClose(): void;
}) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return lower ? items.filter(i => i.label.toLowerCase().includes(lower)) : items;
  }, [items, q]);

  const close = () => { setQ(''); onClose(); };
  const pick = (v: string | null) => { setQ(''); onSelect(v); };

  return (
    <Sheet visible={visible} onClose={close} title={title} scroll={false}>
      <View style={styles.sheetBody}>
        {searchable && (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={`Search ${title.toLowerCase()}s`}
            placeholderTextColor={colors.homeMuted}
            autoCorrect={false}
            style={[styles.sheetSearch, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
          />
        )}
        <FlatList
          data={[{ value: '', label: `All ${title.toLowerCase()}s` }, ...shown]}
          keyExtractor={item => item.value || '__all'}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item.value ? item.value === value : value === null;
            return (
              <TouchableOpacity
                onPress={() => pick(item.value || null)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.sheetRow, { borderBottomColor: colors.homeLine }]}
              >
                <Text style={[styles.sheetRowLabel, { color: colors.homeInk }]} numberOfLines={2}>{item.label}</Text>
                {active && <Feather name="check" size={16} color={colors.homeCoral} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: { flexShrink: 1, gap: spacing.md },
  sheetSearch: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 40, fontSize: 15, fontFamily: 'Inter_400Regular' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetRowLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
});
