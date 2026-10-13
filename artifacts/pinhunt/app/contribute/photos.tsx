/**
 * Photograph your pins — the collector's own pins that have no catalogue
 * photo yet (UX-056, #208). Reached after adding pins (just those pins) and
 * from the Home / My Collection card (all of them). Each row opens the
 * existing contribute flow (consent → photo → clean-up → admin review), whose
 * back button returns here, where the pin then shows as sent.
 *
 * Only for people who can use photo contributions (`catalogue_contributions`:
 * contributors during the beta); the data is gated again server-side.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { usePhotoGaps } from '@/hooks/usePhotoGaps';
import { radius, spacing } from '@/constants/theme';

export default function PhotographYourPinsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { pins } = useLocalSearchParams<{ pins?: string }>();
  const onlyIds = useMemo(() => (pins ? pins.split(',').filter(Boolean) : undefined), [pins]);
  const { enabled, loading, error, refresh, todo, sent } = usePhotoGaps(onlyIds);
  const rows = useMemo(() => [...todo, ...sent], [todo, sent]);
  const done = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const header = (
    <View style={styles.header}>
      <Text style={[styles.body, { color: colors.homeMuted }]}>
        {todo.length > 0
          ? `${todo.length} of your pins ${todo.length === 1 ? 'doesn’t' : 'don’t'} have a catalogue photo yet. Your photo helps every collector recognise ${todo.length === 1 ? 'it' : 'them'}. We check each one before it goes live.`
          : sent.length > 0
            ? `Thanks! ${sent.length} ${sent.length === 1 ? 'photo' : 'photos'} sent for review.`
            : 'All your pins have a catalogue photo. Thank you!'}
      </Text>
      {todo.length > 0 && sent.length > 0 && (
        <Text style={[styles.progress, { color: colors.homeCoralDeep }]}>{sent.length} sent · {todo.length} to go</Text>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Photograph your pins' }} />
      {!enabled && !loading ? (
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <Text style={[styles.body, { color: colors.homeMuted }]}>Photo contributions aren't open to your account yet.</Text>
          <TouchableOpacity onPress={done} accessibilityRole="button" style={styles.textBtn}>
            <Text style={[styles.textBtnLabel, { color: colors.homeCoralDeep }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : loading && rows.length === 0 ? (
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <ActivityIndicator color={colors.homeCoral} />
        </View>
      ) : error && rows.length === 0 ? (
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity onPress={refresh} accessibilityRole="button" style={styles.textBtn}>
            <Text style={[styles.textBtnLabel, { color: colors.homeCoralDeep }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={{ backgroundColor: colors.homeBackground }}
          contentContainerStyle={styles.list}
          data={rows}
          keyExtractor={row => row.pinhuntId}
          ListHeaderComponent={header}
          ListFooterComponent={
            <TouchableOpacity
              onPress={done}
              accessibilityRole="button"
              activeOpacity={0.85}
              style={[styles.doneBtn, todo.length === 0
                ? { backgroundColor: colors.homeCoral }
                : { borderWidth: 1, borderColor: colors.homeLine }]}
            >
              <Text style={[styles.doneLabel, { color: todo.length === 0 ? colors.homeSurface : colors.homeInk }]}>
                {todo.length === 0 ? 'Done' : 'Later'}
              </Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => {
            const isSent = item.myStatus === 'pending';
            return (
              <TouchableOpacity
                disabled={isSent}
                onPress={() => router.push({ pathname: '/contribute-image/[pinId]', params: { pinId: item.pinhuntId, from: 'catalogue' } })}
                accessibilityRole="button"
                accessibilityLabel={isSent ? `${item.title}, photo sent for review` : `Add a photo of ${item.title}`}
                activeOpacity={0.85}
                style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
              >
                <View style={[styles.thumb, { borderColor: isSent ? colors.homeLine : colors.homeCoral, backgroundColor: colors.homeBackground }]}>
                  <Feather name={isSent ? 'clock' : 'camera'} size={18} color={isSent ? colors.homeMuted : colors.homeCoral} />
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.meta, { color: colors.homeMuted }]}>{item.setName}</Text>
                </View>
                {isSent ? (
                  <Text style={[styles.sent, { color: colors.homeMuted }]}>Sent</Text>
                ) : (
                  <View style={[styles.addBtn, { backgroundColor: colors.homeCoral }]}>
                    <Text style={[styles.addLabel, { color: colors.homeSurface }]}>Add photo</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.sm, gap: 6 },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'left' },
  progress: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  addBtn: { minHeight: 36, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  addLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  sent: { fontSize: 13, fontFamily: 'Inter_600SemiBold', paddingHorizontal: spacing.sm },
  textBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { marginTop: spacing.md, minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  doneLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
