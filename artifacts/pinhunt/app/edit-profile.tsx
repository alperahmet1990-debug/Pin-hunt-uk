/**
 * Edit Profile screen — pushed from the Profile tab.
 * Pre-filled with the current profile data. Validates username uniqueness.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import type { ProfileVisibility } from '@workspace/pin-repository';

// ─── Validation ───────────────────────────────────────────────────────────────

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;

function validateUsername(value: string): string | null {
  const t = value.trim();
  if (!t) return 'Username is required';
  if (t.length < 3) return 'At least 3 characters';
  if (t.length > 20) return 'Maximum 20 characters';
  if (!USERNAME_REGEX.test(t)) return 'Letters, numbers, underscores and periods only';
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, updateMyProfile, checkUsernameAvailable } = useProfile();

  // Pre-fill from current profile
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [tradingRegion, setTradingRegion] = useState(profile?.tradingRegion ?? '');
  const [intlTrading, setIntlTrading] = useState(profile?.internationalTradingEnabled ?? false);
  const [allowTradeReqs, setAllowTradeReqs] = useState(profile?.allowTradeRequests ?? true);
  const [allowMsgs, setAllowMsgs] = useState(profile?.allowMessages ?? true);
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile?.profileVisibility ?? 'public');

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalUsername = profile?.username ?? '';

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setUsernameAvailable(null);
    setSaveError(null);

    const err = validateUsername(value);
    setUsernameError(err);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (err || !value.trim()) return;

    // Skip availability check if username hasn't changed
    if (value.trim().toLowerCase() === originalUsername.toLowerCase()) {
      setUsernameAvailable(true);
      return;
    }

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
  }, [checkUsernameAvailable, originalUsername]);

  useEffect(() => {
    // Mark original username as available on mount
    if (originalUsername) setUsernameAvailable(true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [originalUsername]);

  const handleSave = async () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }
    if (usernameAvailable === false) return;

    setSaving(true);
    setSaveError(null);
    try {
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        bio: bio.trim() || undefined,
        tradingRegion: tradingRegion.trim() || undefined,
        internationalTradingEnabled: intlTrading,
        allowTradeRequests: allowTradeReqs,
        allowMessages: allowMsgs,
        profileVisibility: visibility,
      });
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setSaveError(msg.includes('duplicate') || msg.includes('unique') ? 'This username is already taken' : msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !!username.trim() &&
    !usernameError &&
    usernameAvailable !== false &&
    !checkingUsername &&
    !saving;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Info */}
          <SectionHeader title="Basic Info" />

          <Field label="Username *" error={usernameError}>
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
          </Field>

          <Field label="Bio">
            <TextInput
              style={[styles.input, styles.inputBlock, styles.inputMultiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell other collectors about yourself…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
          </Field>

          <Field label="Trading Region">
            <TextInput
              style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={tradingRegion}
              onChangeText={setTradingRegion}
              placeholder="e.g. London, UK"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
            />
          </Field>

          {/* Trading Preferences */}
          <SectionHeader title="Trading Preferences" />

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ToggleRow
              label="International Trading"
              description="Allow trades outside the UK"
              value={intlTrading}
              onValueChange={setIntlTrading}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              label="Allow Trade Requests"
              description="Let collectors send you trade requests"
              value={allowTradeReqs}
              onValueChange={setAllowTradeReqs}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              label="Allow Messages"
              description="Let other collectors message you"
              value={allowMsgs}
              onValueChange={setAllowMsgs}
            />
          </View>

          {/* Privacy */}
          <SectionHeader title="Privacy" />

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <VisibilityRow
              value={visibility}
              onChange={setVisibility}
            />
          </View>

          {/* Save error */}
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
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {children}
      {error && <Text style={[styles.fieldError, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );
}

function ToggleRow({ label, description, value, onValueChange }: {
  label: string;
  description: string;
  value: boolean;
  onValueChange(v: boolean): void;
}) {
  const colors = useColors();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.muted, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

function VisibilityRow({ value, onChange }: { value: ProfileVisibility; onChange(v: ProfileVisibility): void }) {
  const colors = useColors();
  const options: Array<{ key: ProfileVisibility; label: string; desc: string }> = [
    { key: 'public', label: 'Public', desc: 'Anyone can find your profile' },
    { key: 'private', label: 'Private', desc: 'Only you can see your profile' },
  ];
  return (
    <View style={{ gap: 0 }}>
      {options.map((opt, i) => (
        <TouchableOpacity
          key={opt.key}
          style={[styles.visibilityOption, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          onPress={() => onChange(opt.key)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{opt.label}</Text>
            <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
          </View>
          <View style={[styles.radio, { borderColor: colors.primary }]}>
            {value === opt.key && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionHeader: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 24, marginBottom: 8 },
  fieldWrapper: { gap: 6, marginBottom: 16 },
  label: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
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
  input: { fontSize: 16, fontFamily: 'Inter_400Regular', borderRadius: 10 },
  inputFlex: { flex: 1 },
  inputBlock: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  toggleLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  toggleDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  visibilityOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
