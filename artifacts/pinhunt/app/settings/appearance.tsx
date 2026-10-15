/**
 * Settings → Appearance (#224): pick your side.
 *
 * Three big cards, each with a live mini-preview drawn from the real palette
 * it applies: System (half and half, follows the device), Light Side and
 * Dark Side. Picking one springs the card, gives a light haptic and applies
 * the theme at once.
 *
 * Copyright: "Light Side" / "Dark Side" are used as plain words only. No
 * film names, characters, quotes, logos, fonts, sounds or lightsaber-style
 * imagery; the icons are the generic Feather sun, moon and phone.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import palettes from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import {
  APPEARANCE_OPTIONS,
  setAppearance,
  useAppearancePreference,
  type AppearancePreference,
} from '@/hooks/useAppearance';

const TAGLINES: Record<AppearancePreference, string> = {
  system: 'Follows your device and switches when it does.',
  light: 'Bright and breezy, made for daytime pin hunts.',
  dark: 'Easy on the eyes for late-night trading.',
};

type Palette = typeof palettes.light;

/** A tiny phone screen in one palette: header, a "Find a Pin" pill and two pin tiles. */
function MiniScreen({ p, style }: { p: Palette; style?: object }) {
  return (
    <View style={[styles.mini, { backgroundColor: p.homeBackground }, style]}>
      <View style={[styles.miniHeader, { backgroundColor: p.homeInk }]} />
      <View style={[styles.miniHero, { backgroundColor: p.homeCoral }]} />
      <View style={styles.miniTiles}>
        <View style={[styles.miniTile, { backgroundColor: p.homeSurface, borderColor: p.homeLine }]}>
          <View style={[styles.miniPin, { backgroundColor: p.homeAqua }]} />
        </View>
        <View style={[styles.miniTile, { backgroundColor: p.homeSurface, borderColor: p.homeLine }]}>
          <View style={[styles.miniPin, { backgroundColor: p.homeAqua }]} />
        </View>
      </View>
    </View>
  );
}

function Preview({ value }: { value: AppearancePreference }) {
  if (value === 'light') return <MiniScreen p={palettes.light} />;
  if (value === 'dark') return <MiniScreen p={palettes.dark as Palette} />;
  // System: light on the left, dark on the right.
  return (
    <View style={styles.split}>
      <View style={styles.splitHalf}><MiniScreen p={palettes.light} /></View>
      <View style={[styles.splitHalf, styles.splitRight]}><MiniScreen p={palettes.dark as Palette} style={styles.splitRightInner} /></View>
    </View>
  );
}

function SideCard({ value, label, icon, selected, onPick }: {
  value: AppearancePreference;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  selected: boolean;
  onPick: () => void;
}) {
  const colors = useColors();
  const pop = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const wasSelected = useRef(selected);

  useEffect(() => {
    if (selected && !wasSelected.current) {
      pop.setValue(0.96);
      spin.setValue(0);
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]).start();
    }
    wasSelected.current = selected;
  }, [selected, pop, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', value === 'dark' ? '-360deg' : '360deg'] });

  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <TouchableOpacity
        onPress={onPick}
        activeOpacity={0.9}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${label}. ${TAGLINES[value]}`}
        style={[styles.card, {
          backgroundColor: colors.homeSurface,
          borderColor: selected ? colors.homeCoral : colors.homeLine,
          borderWidth: selected ? 2 : 1,
        }]}
      >
        <Preview value={value} />
        <View style={styles.cardText}>
          <View style={styles.cardTitleRow}>
            <Animated.View style={[styles.iconBubble, { backgroundColor: selected ? colors.homeCoral : colors.homeAqua, transform: [{ rotate }] }]}>
              <Feather name={icon} size={16} color={selected ? colors.homeSurface : colors.homeInk} />
            </Animated.View>
            <Text style={[styles.cardTitle, { color: colors.homeInk }]}>{label}</Text>
            {selected && (
              <View style={[styles.check, { backgroundColor: colors.homeCoral }]}>
                <Feather name="check" size={13} color={colors.homeSurface} />
              </View>
            )}
          </View>
          <Text style={[styles.tagline, { color: colors.homeMuted }]}>{TAGLINES[value]}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function AppearanceScreen() {
  const colors = useColors();
  const pref = useAppearancePreference();
  const pick = (value: AppearancePreference) => {
    if (value === pref) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setAppearance(value);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Appearance' }} />
      <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>Pick your side</Text>
        <Text style={[styles.subtitle, { color: colors.homeMuted }]}>
          Choose how PinHunt looks. You can switch any time.
        </Text>
        <View accessibilityRole="radiogroup" style={styles.cards}>
          {APPEARANCE_OPTIONS.map(o => (
            <SideCard key={o.value} value={o.value} label={o.label} icon={o.icon} selected={pref === o.value} onPick={() => pick(o.value)} />
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const MINI_H = 96;

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 4, marginBottom: spacing.lg },
  cards: { gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, padding: spacing.md },
  cardText: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBubble: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold' },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tagline: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  mini: { width: 64, height: MINI_H, borderRadius: 12, padding: 6, gap: 5, overflow: 'hidden' },
  miniHeader: { height: 6, width: '55%', borderRadius: 3, opacity: 0.85 },
  miniHero: { height: 22, borderRadius: 6 },
  miniTiles: { flexDirection: 'row', gap: 4 },
  miniTile: { flex: 1, height: 30, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniPin: { width: 12, height: 12, borderRadius: 6 },
  split: { width: 64, height: MINI_H, borderRadius: 12, overflow: 'hidden', flexDirection: 'row' },
  splitHalf: { width: 32, height: MINI_H, overflow: 'hidden' },
  splitRight: { alignItems: 'flex-end' },
  splitRightInner: { borderRadius: 0 },
});
