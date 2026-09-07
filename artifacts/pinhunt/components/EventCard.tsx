/**
 * Image-led card for the Home "What's Happening" carousel. Sizes purely
 * from fixed dimensions and numberOfLines-capped text — no `flex: 1`, no
 * negative margins — same deterministic-sizing rule as the other Home/Find
 * Trades horizontal shelves (see app/find-trades.tsx's layout note).
 */
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { radius, shadow, spacing } from '@/constants/theme';
import { countryFlag, formatEventDateParts, timeAgo } from '@/utils/events';
import type { PinHuntEvent } from '@/types/event';

const STANDARD_WIDTH = 248;
const FEATURED_WIDTH = 288;
const STANDARD_IMAGE_HEIGHT = 146;
const FEATURED_IMAGE_HEIGHT = 176;

function badgeTone(event: PinHuntEvent, colors: ReturnType<typeof useColors>): string {
  if (event.sourceType === 'community') return colors.homeCoral;
  switch (event.badgeLabel) {
    case 'DLP EVENT': return colors.homeCoralDeep;
    case 'UK TRADING': return colors.homeTealSoft;
    default: return colors.homeSandInk;
  }
}

function EventPlaceholderArt({ height, colors }: { height: number; colors: ReturnType<typeof useColors> }) {
  return (
    <LinearGradient
      colors={[colors.homeCoralDeep, colors.homeCoral, colors.homeSand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.placeholder, { height }]}
    >
      <View pointerEvents="none" style={[styles.placeholderRing, { borderColor: colors.homeSand }]} />
      <View pointerEvents="none" style={[styles.placeholderOrbit, { borderColor: colors.homeSurface }]} />
      <Image
        source={require('../assets/images/pinhunt-logo.png')}
        style={styles.placeholderLogo}
        resizeMode="contain"
      />
      <Text style={[styles.placeholderLabel, { color: colors.homeHeroText }]}>EVENT</Text>
    </LinearGradient>
  );
}

export function EventCard({ event, onPress }: { event: PinHuntEvent; onPress: () => void }) {
  const colors = useColors();
  const width = event.featured ? FEATURED_WIDTH : STANDARD_WIDTH;
  const imageHeight = event.featured ? FEATURED_IMAGE_HEIGHT : STANDARD_IMAGE_HEIGHT;
  const { day, month } = formatEventDateParts(event);
  const flag = countryFlag(event.country);
  const locationLine = [event.location, flag].filter(Boolean).join(' ') + (event.time ? ` · ${event.time}` : '');
  const ctaLabel = event.sourceType === 'community' ? 'View post →' : 'View event →';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[
        styles.card,
        { width, backgroundColor: colors.homeSurface, borderColor: colors.homeLine, shadowColor: colors.homeShadow },
      ]}
    >
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        {event.image ? (
          <Image source={event.image} style={styles.image} resizeMode="cover" />
        ) : (
          <EventPlaceholderArt height={imageHeight} colors={colors} />
        )}
        <View style={[styles.badge, { backgroundColor: badgeTone(event, colors) }]}>
          <Text style={styles.badgeText}>{event.badgeLabel}</Text>
        </View>
      </View>
      <View style={styles.body}>
        {event.hasScheduledDate ? (
          <Text style={[styles.dateLine, { color: colors.homeCoralDeep }]} numberOfLines={1}>{day} {month}</Text>
        ) : (
          <View style={styles.dateLineRow}>
            <Feather name="clock" size={11} color={colors.homeCoralDeep} />
            <Text style={[styles.dateLine, { color: colors.homeCoralDeep }]} numberOfLines={1}>{timeAgo(event.createdAt)}</Text>
          </View>
        )}
        <Text numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{event.title}</Text>
        {!!locationLine.trim() && (
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={11} color={colors.homeMuted} />
            <Text numberOfLines={1} style={[styles.location, { color: colors.homeMuted }]}>{locationLine.trim()}</Text>
          </View>
        )}
        <Text numberOfLines={2} style={[styles.description, { color: colors.homeMuted }]}>{event.description}</Text>
        <Text style={[styles.cta, { color: colors.homeCoralDeep }]}>{ctaLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginRight: spacing.sm,
    overflow: 'hidden',
    shadowOpacity: shadow.card.shadowOpacity,
    shadowRadius: shadow.card.shadowRadius,
    shadowOffset: shadow.card.shadowOffset,
    elevation: shadow.card.elevation,
  },
  imageWrap: { width: '100%' },
  image: { width: '100%', height: '100%' },
  placeholder: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholderRing: { position: 'absolute', width: 120, height: 120, borderWidth: 20, borderRadius: 60, right: -40, bottom: -50, opacity: 0.4 },
  placeholderOrbit: { position: 'absolute', width: 160, height: 60, borderWidth: 1, borderRadius: 80, left: -30, top: 14, opacity: 0.3, transform: [{ rotate: '-16deg' }] },
  placeholderLogo: { width: 36, height: 36, opacity: 0.85, marginBottom: 6 },
  placeholderLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  badge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 9.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, color: '#FFFFFF' },
  body: { padding: spacing.sm + 2 },
  dateLine: { fontSize: 11, lineHeight: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  dateLineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontSize: 16, lineHeight: 19, fontFamily: 'Inter_700Bold', marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  location: { fontSize: 11.5, fontFamily: 'Inter_500Medium', flexShrink: 1 },
  description: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: spacing.sm - 2 },
  cta: { fontSize: 12.5, fontFamily: 'Inter_700Bold', marginTop: spacing.sm - 2 },
});
