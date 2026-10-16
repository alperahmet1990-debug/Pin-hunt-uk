/**
 * PostPinPreview (B-P2-17, #71): the pin on a For Trade or ISO post in the
 * Community feed. A 72 pt photo in the tile-within-a-tile frame, with what
 * the post is about ("For trade" / "Looking for") and the pin's name, so the
 * card reads at a glance instead of from a small text chip.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CommunityPost } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { PinImage } from '@/components/ui/PinImage';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { fontScale, radius, spacing } from '@/constants/theme';

export const POST_PIN_IMAGE_SIZE = 72;

/** Post types whose linked pin gets the large preview; the rest keep the small chip. */
export function showsPinPreview(postType: CommunityPost['postType']): boolean {
  return postType === 'for_trade' || postType === 'in_search_of';
}

export function PostPinPreview({ pin, postType }: {
  pin: NonNullable<CommunityPost['linkedPin']>;
  postType: 'for_trade' | 'in_search_of';
}) {
  const colors = useColors();
  const trade = postType === 'for_trade';
  const accent = trade ? colors.forTrade : colors.homeSand;
  return (
    <View testID="post-pin-preview" style={[styles.row, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
      <View testID="post-pin-photo" style={[styles.inner, { backgroundColor: colors.homeSurface }]}>
        <PinImage
          source={pin.imageUrl ? { uri: pin.imageUrl } : PLACEHOLDER_IMAGE}
          accessible={false}
          style={styles.image}
          contentFit="contain"
        />
      </View>
      <View style={styles.text}>
        <View style={styles.labelRow}>
          <Feather name={trade ? 'repeat' : 'search'} size={11} color={accent} />
          <Text style={[styles.label, { color: accent }]} maxFontSizeMultiplier={fontScale.badge}>
            {trade ? 'FOR TRADE' : 'LOOKING FOR'}
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.homeInk }]} numberOfLines={2}>{pin.title}</Text>
        {pin.brand ? (
          <Text style={[styles.brand, { color: colors.homeMuted }]} numberOfLines={1}>{pin.brand}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: 6, paddingRight: spacing.md },
  inner: { width: POST_PIN_IMAGE_SIZE, height: POST_PIN_IMAGE_SIZE, borderRadius: radius.sm, padding: 4, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  text: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  title: { fontSize: 14.5, lineHeight: 19, fontFamily: 'Inter_700Bold', marginTop: 2 },
  brand: { fontSize: 12.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
