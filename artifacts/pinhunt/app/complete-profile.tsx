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
import { useProfile } from '@/context/ProfileContext';

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

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [tradingRegion, setTradingRegion] = useState('');

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
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        tradingRegion: tradingRegion.trim() || undefined,
      });
      // ProfileContext sets needsUsername → false → AuthGuard navigates to (tabs)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      setSaveError(msg.includes('duplicate') || msg.includes('unique') ? 'This username is already taken' : msg);
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '22' }]}>
              <Feather name="user" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Complete Your Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Set up your collector identity before you dive in.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Field label="Username *" hint="3–20 characters. Letters, numbers, _ and . only.">
              <View style={[styles.inputRow, { borderColor: usernameError ? colors.destructive : colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.atSign, { color: colors.mutedForeground }]}>@</Text>
                <TextInput
                  style={[styles.input, styles.inputFlex, { color: colors.foreground }]}
                  value={username}
                  onChangeText={handleUsernameChange}
                  placeholder="yourname"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
                {checkingUsername && <ActivityIndicator size="small" color={colors.mutedForeground} />}
                {!checkingUsername && usernameAvailable === true && (
                  <Feather name="check-circle" size={16} color={colors.owned} />
                )}
                {!checkingUsername && usernameAvailable === false && (
                  <Feather name="x-circle" size={16} color={colors.destructive} />
                )}
              </View>
              {usernameError && <Text style={[styles.fieldError, { color: colors.destructive }]}>{usernameError}</Text>}
            </Field>

            <Field label="Display Name">
              <TextInput
                style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your Name"
                placeholderTextColor={colors.mutedForeground}
                maxLength={60}
              />
            </Field>

            <Field label="Bio" hint="Tell other collectors about yourself.">
              <TextInput
                style={[styles.input, styles.inputBlock, styles.inputMultiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Disney pin collector since…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </Field>

            <Field label="Trading Region" hint="Helps collectors find local trades.">
              <TextInput
                style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={tradingRegion}
                onChangeText={setTradingRegion}
                placeholder="e.g. London, UK"
                placeholderTextColor={colors.mutedForeground}
                maxLength={60}
              />
            </Field>

            {saveError && (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{saveError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.muted }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Continue</Text>
              )}
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
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {children}
      {hint && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', marginBottom: 32, gap: 12 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  form: { gap: 20 },
  fieldWrapper: { gap: 6 },
  label: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  atSign: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    borderRadius: 10,
  },
  inputFlex: { flex: 1 },
  inputBlock: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
