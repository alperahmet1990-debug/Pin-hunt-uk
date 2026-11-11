/**
 * "PinHunt is for adults" (LP-8, #530).
 *
 * The only screen a declined account can reach (AuthGuard), besides Delete
 * account. Declined means the collector said they're under 18, or a
 * moderator closed the account as under 18 (LP-9, #531). There's no retry:
 * mistakes go to support.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { radius, spacing } from '@/constants/theme';
import { feedbackMailtoUrl, SUPPORT_EMAIL } from '@/constants/appConfig';
import { UNDER_AGE_MESSAGE } from '@/utils/ageCheck';

export default function NotEligibleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const supportUrl = feedbackMailtoUrl(SUPPORT_EMAIL, 'PinHunt age check');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.homeBackground }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingTop: insets.top + spacing.xxxl,
        paddingBottom: insets.bottom + spacing.xxxl,
        paddingHorizontal: spacing.xxl,
      }}
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: colors.homeCoral + '22' }]}>
          <Feather name="lock" size={28} color={colors.homeCoral} />
        </View>
        <Text style={[styles.title, { color: colors.homeInk }]} accessibilityRole="header">
          PinHunt is for adults
        </Text>
        <Text style={[styles.body, { color: colors.homeInk }]}>{UNDER_AGE_MESSAGE}</Text>
        <Text style={[styles.body, { color: colors.homeMuted }]}>
          You can delete your account and everything in it, or sign out.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.destructive }]}
          onPress={() => router.push('/delete-account')}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.homeSurface }]}>Delete account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondary, { borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}
          onPress={async () => {
            setSigningOut(true);
            try { await signOut(); } finally { setSigningOut(false); }
          }}
          disabled={signingOut}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.homeInk }]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.support}>
        <Text style={[styles.supportText, { color: colors.homeMuted }]}>
          If this is a mistake, contact PinHunt support.
        </Text>
        {supportUrl ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(supportUrl).catch(() => {})}
            accessibilityRole="link"
            style={styles.supportLink}
          >
            <Text style={[styles.supportLinkText, { color: colors.homeCoral }]}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xxxl },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  body: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  actions: { gap: spacing.md },
  button: { height: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  support: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.xs },
  supportText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  supportLink: { minHeight: 44, justifyContent: 'center' },
  supportLinkText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
});
