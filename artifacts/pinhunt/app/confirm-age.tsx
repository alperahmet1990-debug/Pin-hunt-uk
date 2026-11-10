/**
 * Confirm age (LP-8, #530).
 *
 * Shown once to a signed-in account that hasn't confirmed its age yet, mostly
 * accounts from before the check existed. AuthGuard keeps the collector here
 * until it's done. The date is sent to the server, which decides with its own
 * date and keeps only the result; under 18 leads to the not-eligible screen.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';
import { radius, spacing } from '@/constants/theme';
import { DateOfBirthField, EMPTY_DATE_OF_BIRTH, type DateOfBirthValue } from '@/components/DateOfBirthField';
import { checkBirthDate, INVALID_DOB_MESSAGE } from '@/utils/ageCheck';

export default function ConfirmAgeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { confirmAge } = useProfile();
  const { signOut } = useAuth();
  const [dob, setDob] = useState<DateOfBirthValue>(EMPTY_DATE_OF_BIRTH);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (saving) return;
    const check = checkBirthDate(dob.day, dob.month, dob.year);
    if (check.kind === 'invalid') {
      setError(INVALID_DOB_MESSAGE);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Under 18 is sent too: the server records it and AuthGuard moves on.
      await confirmAge(check.isoDate);
      // AuthGuard redirects once the status changes.
    } catch (err) {
      setError((err as Error)?.message || 'Could not confirm your age. Try again.');
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.xxxl,
            paddingHorizontal: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.homeCoral + '22' }]}>
              <Feather name="calendar" size={28} color={colors.homeCoral} />
            </View>
            <Text style={[styles.title, { color: colors.homeInk }]} accessibilityRole="header">
              Confirm your age
            </Text>
            <Text style={[styles.subtitle, { color: colors.homeMuted }]}>
              We ask everyone once. Enter your date of birth to carry on.
            </Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBox, { borderColor: colors.destructive, backgroundColor: colors.destructive + '14' }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              </View>
            ) : null}

            <DateOfBirthField value={dob} onChange={setDob} onSubmitEditing={submit} />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.homeCoral }, saving && styles.buttonDisabled]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color={colors.homeSurface} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.homeSurface }]}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={async () => {
                setSigningOut(true);
                try { await signOut(); } finally { setSigningOut(false); }
              }}
              disabled={signingOut}
              accessibilityRole="button"
            >
              <Text style={[styles.signOutText, { color: colors.homeMuted }]}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', marginBottom: spacing.xxxl, gap: spacing.md },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  form: { gap: spacing.lg },
  button: { height: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  signOutBtn: { alignSelf: 'center', paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  signOutText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  errorBox: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
