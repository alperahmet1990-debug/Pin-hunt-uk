/**
 * Complete Profile screen
 *
 * Shown after first sign-in when the user has not yet set a username.
 * The user cannot access the main app until this is done.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { profileSaveErrorLine } from '@/utils/userError';
import { HomeMarketChoice } from '@/components/HomeMarketChoice';
import { isHomeMarketUnavailable, marketFromDeviceRegion } from '@/utils/homeMarket';
import type { HomeMarket } from '@/utils/format';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';
import { radius, spacing } from '@/constants/theme';

// ─── Validation ───────────────────────────────────────────────────────────────

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;

function validateUsername(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Username is required';
  if (trimmed.length < 3) return 'At least 3 characters';
  if (trimmed.length > 20) return 'Maximum 20 characters';
  if (!USERNAME_REGEX.test(trimmed)) return 'Letters, numbers, underscores and periods only';
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CompleteProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateMyProfile, checkUsernameAvailable } = useProfile();
  // No back from here, so a way out for someone signed in to the wrong
  // account (#463). AuthGuard sends a signed-out user to login.
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [tradingRegion, setTradingRegion] = useState('');
  const [homeMarket, setHomeMarket] = useState<HomeMarket>(() => marketFromDeviceRegion());

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Username availability check (debounced) ───────────────────────────────
  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setUsernameAvailable(null);
    setSaveError(null);

    const err = validateUsername(value);
    setUsernameError(err);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (err || !value.trim()) return;

    debounceRef.current = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const available = await checkUsernameAvailable(value.trim());
        setUsernameAvailable(available);
        if (!available) setUsernameError('This username is taken');
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
  }, [checkUsernameAvailable]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }
    if (usernameAvailable === false) return;
    if (checkingUsername) return;

    setSaving(true);
    setSaveError(null);
    try {
      const details = {
        username: username.trim().toLowerCase(),
        bio: bio.trim() || undefined,
        tradingRegion: tradingRegion.trim() || undefined,
      };
      try {
        await updateMyProfile({ ...details, homeMarket });
      } catch (err) {
        // Before migration 068 a home market can't be saved yet; the rest can.
        if (!isHomeMarketUnavailable(err)) throw err;
        await updateMyProfile(details);
      }
      // ProfileContext sets needsUsername → false → AuthGuard navigates to (tabs)
    } catch (err: unknown) {
      setSaveError(profileSaveErrorLine(err));
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !!username.trim() &&
    !usernameError &&
    (usernameAvailable === true || usernameAvailable === null) &&
    !checkingUsername &&
    !saving;

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxxl, paddingHorizontal: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.homeCoral + '22' }]}>
              <Feather name="user" size={28} color={colors.homeCoral} />
            </View>
            <Text style={[styles.title, { color: colors.homeInk }]}>Complete Your Profile</Text>
            <Text style={[styles.subtitle, { color: colors.homeMuted }]}>
              Set up your collector identity before you dive in.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Field label="Username *" hint="3–20 characters · Letters, numbers, _ and . only · This will be your public name on PinHunt">
              <View style={[styles.inputRow, { borderColor: usernameError ? colors.destructive : colors.homeLine, backgroundColor: colors.homeSurface }]}>
                <Text style={[styles.atSign, { color: colors.homeMuted }]}>@</Text>
                <TextInput
                  style={[styles.input, styles.inputFlex, { color: colors.homeInk }]}
                  value={username}
                  onChangeText={handleUsernameChange}
                  placeholder="yourname"
                  placeholderTextColor={colors.homeMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
                {checkingUsername && <ActivityIndicator size="small" color={colors.homeMuted} />}
                {!checkingUsername && usernameAvailable === true && (
                  <Feather name="check-circle" size={16} color={colors.owned} />
                )}
                {!checkingUsername && usernameAvailable === false && (
                  <Feather name="x-circle" size={16} color={colors.destructive} />
                )}
              </View>
              {usernameError && <Text style={[styles.fieldError, { color: colors.destructive }]}>{usernameError}</Text>}
            </Field>

            <Field label="Bio" hint="Tell other collectors about yourself.">
              <TextInput
                style={[styles.input, styles.inputBlock, styles.inputMultiline, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Disney pin collector since…"
                placeholderTextColor={colors.homeMuted}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </Field>

            <Field label="Trading Region" hint="Helps collectors find local trades.">
              <TextInput
                style={[styles.input, styles.inputBlock, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}
                value={tradingRegion}
                onChangeText={setTradingRegion}
                placeholder="e.g. London, UK"
                placeholderTextColor={colors.homeMuted}
                maxLength={60}
              />
            </Field>

            {/* Home market (HM-02, #562): sets prices, events and dates. */}
            <Field label="Where do you collect?" hint="Sets your currency and date style. You can change it any time in Profile.">
              <HomeMarketChoice value={homeMarket} onChange={setHomeMarket} disabled={saving} />
            </Field>

            {saveError && (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{saveError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: canSave ? colors.homeCoral : colors.homeAqua, shadowColor: colors.homeShadow }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={colors.homeSurface} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.homeSurface }]}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={async () => {
                setSigningOut(true);
                try { await signOut(); } finally { setSigningOut(false); }
              }}
              disabled={signingOut || saving}
              accessibilityRole="button"
              hitSlop={8}
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

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.label, { color: colors.homeInk }]}>{label}</Text>
      {children}
      {hint && <Text style={[styles.hint, { color: colors.homeMuted }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', marginBottom: spacing.xxxl, gap: spacing.md },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  form: { gap: spacing.xxl - 4 },
  fieldWrapper: { gap: spacing.sm - 2 },
  label: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  atSign: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    borderRadius: radius.sm,
  },
  inputFlex: { flex: 1 },
  inputBlock: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  signOutBtn: { alignSelf: 'center', paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  signOutText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  errorBox: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  saveBtn: {
    borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.xs,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  saveBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
