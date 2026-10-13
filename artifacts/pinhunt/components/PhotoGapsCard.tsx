/**
 * "Pins that need a photo (N)" — Home and My Collection (UX-056, #208).
 * Only for photo contributors, only when they own pins with no catalogue
 * photo they haven't sent one for. "Not now" hides it for 7 days.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { usePhotoGaps } from '@/hooks/usePhotoGaps';
import { isSnoozed, photoCardSnoozeKey } from '@/utils/photoGaps';

export function PhotoGapsCard({ style }: { style?: object }) {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const { enabled, todo } = usePhotoGaps();
  // Hidden until the snooze check answers, so it never flashes up.
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(photoCardSnoozeKey(userId))
      .then(at => { if (!cancelled) setSnoozed(isSnoozed(at)); })
      .catch(() => { if (!cancelled) setSnoozed(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!enabled || snoozed || todo.length === 0) return null;

  const snooze = () => {
    setSnoozed(true);
    if (userId) AsyncStorage.setItem(photoCardSnoozeKey(userId), String(Date.now())).catch(() => {});
  };
  const count = todo.length;

  return (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }, style]}>
      <TouchableOpacity
        onPress={() => router.push('/contribute/photos')}
        accessibilityRole="button"
        accessibilityLabel={`Pins that need a photo, ${count}. Snap them to help other collectors.`}
        activeOpacity={0.85}
        style={styles.main}
      >
        <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
          <Feather name="camera" size={18} color={colors.homeCoralDeep} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.homeInk }]}>Pins that need a photo ({count})</Text>
          <Text style={[styles.detail, { color: colors.homeMuted }]}>Snap them to help other collectors</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.homeMuted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={snooze} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={6} style={styles.close}>
        <Text style={[styles.closeLabel, { color: colors.homeMuted }]}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, paddingVertical: 4, paddingLeft: 11, paddingRight: 4, flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  main: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  detail: { fontSize: 11.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
  close: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  closeLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
