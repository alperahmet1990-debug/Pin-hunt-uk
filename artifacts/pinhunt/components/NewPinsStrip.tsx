/**
 * Home "New to the catalogue": the newest pins pulled from Pin & Pop that
 * still need a photo, in one scrolling row. Tapping a pin opens the photo
 * contribution flow; See all opens Contribute pictures, newest first.
 *
 * Only for people who can contribute photos ('catalogue_contributions' flag)
 * and only once migration 088 (newest order) is applied. Otherwise, or when
 * every new pin already has a photo, it isn't shown. Pin & Pop's own images
 * are never shown (licence: reference only), so every tile is a "needs photo"
 * placeholder.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { CatalogueImageCoverage } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useFeature } from '@/hooks/useFeature';
import { useNewestNeedingPhotos } from '@/hooks/useCatalogueCoverage';
import { fontScale } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

const STRIP_SIZE = 12;

export function NewPinsStrip() {
  const colors = useColors();
  const router = useRouter();
  const { enabled } = useFeature('catalogue_contributions');
  const { rows } = useNewestNeedingPhotos(enabled, STRIP_SIZE);

  if (!enabled || rows.length === 0) return null;

  const seeAll = () => router.push({ pathname: '/contribute', params: { sort: 'newest', filter: 'needs' } });
  const open = (row: CatalogueImageCoverage) =>
    router.push({ pathname: '/contribute-image/[pinId]', params: { pinId: row.pinhuntId, from: 'catalogue' } });

  return (
    <View testID="home-new-pins" style={styles.section}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>New to the catalogue</Text>
          <Text style={[styles.sub, { color: colors.homeMuted }]} numberOfLines={1}>Just added. Have one? Add the first photo</Text>
        </View>
        <Button variant="text" label="See all" accessibilityLabel="See all new pins that need a photo" onPress={seeAll} style={styles.seeAll} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        {rows.map(row => (
          <TouchableOpacity
            key={row.pinhuntId}
            accessibilityRole="button"
            accessibilityLabel={`${row.title}, ${row.setName}. Needs a photo. Add one`}
            onPress={() => open(row)}
            activeOpacity={0.85}
            style={styles.tile}
          >
            <View style={[styles.art, { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral }]}>
              <Feather name="camera" size={22} color={colors.homeCoral} />
              <View style={[styles.badge, { backgroundColor: colors.homeCoral }]}>
                <Feather name="plus" size={9} color={colors.homeHeroText} />
                <Text maxFontSizeMultiplier={fontScale.badge} style={[styles.badgeLabel, { color: colors.homeHeroText }]}>Add photo</Text>
              </View>
            </View>
            <Text numberOfLines={2} maxFontSizeMultiplier={fontScale.dense} style={[styles.pinTitle, { color: colors.homeInk }]}>{row.title}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={fontScale.dense} style={[styles.pinSet, { color: colors.homeMuted }]}>{row.setName}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 6, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2 },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  sub: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
  seeAll: { marginVertical: -12, marginRight: -8 },
  // Bleed to the screen edges (Home has 16px side padding) so the row scrolls edge to edge.
  scroller: { marginHorizontal: -16 },
  row: { paddingHorizontal: 16, gap: 10 },
  tile: { width: 104, gap: 5 },
  art: { width: 104, height: 104, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 999, paddingVertical: 3 },
  badgeLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  pinTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 15 },
  pinSet: { fontSize: 11, fontFamily: 'Inter_500Medium' },
});
