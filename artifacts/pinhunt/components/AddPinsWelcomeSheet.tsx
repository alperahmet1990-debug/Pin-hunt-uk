/**
 * One-time "Already collecting?" offer for new accounts (UX-055, #207).
 * Shown on Home after Complete Profile, never again once answered. Rendered
 * in-app (not Alert) so the buttons work on Expo web.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { useCollection } from '@/context/CollectionContext';
import { ADD_PINS_ROUTE, shouldOfferWelcome, welcomeSeenKey } from '@/utils/addPinsOnboarding';

export function AddPinsWelcomeSheet() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { collection } = useCollection();
  const [visible, setVisible] = useState(false);
  const userId = user?.id;
  const pinCount = Object.keys(collection).length;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(welcomeSeenKey(userId))
      .then(seen => {
        if (!cancelled) setVisible(shouldOfferWelcome({ pinCount, accountCreatedAt: profile?.createdAt, seen: !!seen }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, pinCount, profile?.createdAt]);

  const close = (then?: () => void) => {
    setVisible(false);
    if (userId) AsyncStorage.setItem(welcomeSeenKey(userId), '1').catch(() => {});
    then?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close()}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
        >
          <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
            <Feather name="grid" size={24} color={colors.homeCoralDeep} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>Already collecting?</Text>
          <Text style={[styles.body, { color: colors.homeMuted }]}>
            Add the pins you own straight from the catalogue. Pick a set and tap Select all, no scanning needed.
          </Text>
          <TouchableOpacity
            onPress={() => close(() => router.push(ADD_PINS_ROUTE))}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.homeCoral }]}
          >
            <Text style={[styles.primaryLabel, { color: colors.homeSurface }]}>Add pins you own</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close()} accessibilityRole="button" style={styles.secondary}>
            <Text style={[styles.secondaryLabel, { color: colors.homeCoralDeep }]}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 24, borderWidth: 1, padding: 22, alignItems: 'center' },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, marginBottom: 18 },
  primary: { alignSelf: 'stretch', minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  secondary: { alignSelf: 'stretch', minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
