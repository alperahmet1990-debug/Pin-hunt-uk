/**
 * Edit Profile screen — pushed from the Profile tab.
 * Pre-filled with the current profile data. Validates username uniqueness.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/Avatar';
import type { ProfileVisibility } from '@workspace/pin-repository';

// ─── Geocoding API ────────────────────────────────────────────────────────────

import { API_BASE } from '@/lib/apiBase';

/**
 * Calls the server-side geocode endpoint.
 * Sends the user's JWT so the server can verify identity and write
 * approx_lat / approx_lng using the service-role key (bypassing column RLS).
 * Returns null on success, or an error message string on failure.
 */
async function geocodePostcode(postcode: string, jwt: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ postcode }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? 'Geocoding failed. Please try again.';
  } catch {
    return 'Could not reach the server. Please check your connection and try again.';
  }
}

/**
 * Calls the server-side clear-location endpoint. Nulls approx_lat/approx_lng
 * server-side; the DB trigger flips hasLocationSet back to false.
 * Returns null on success, or an error message string on failure.
 */
async function clearLocation(jwt: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/geocode/clear`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? 'Failed to remove location. Please try again.';
  } catch {
    return 'Could not reach the server. Please check your connection and try again.';
  }
}

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
  const { profile, updateMyProfile, checkUsernameAvailable, refreshProfile } = useProfile();
  const { session } = useAuth();
  const { section } = useLocalSearchParams<{ section?: string }>();

  // Scroll-to-section support (e.g. Profile tab location banner → "location")
  const scrollRef = useRef<ScrollView>(null);
  const locationSectionY = useRef<number | null>(null);
  const didAutoScroll = useRef(false);

  const maybeScrollToSection = useCallback(() => {
    if (section === 'location' && !didAutoScroll.current && locationSectionY.current != null) {
      didAutoScroll.current = true;
      // Small delay so layout settles before scrolling
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(locationSectionY.current! - 12, 0), animated: true });
      }, 250);
    }
  }, [section]);

  // Pre-fill from current profile
  const userId = session?.user?.id;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const uploadAndSetAvatar = async (uri: string) => {
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      // Derive extension and MIME type from the URI.
      const rawExt = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
      const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      // Always overwrite the same path so old photos don't accumulate in storage.
      const path = `${userId}/avatar.${ext}`;

      // React Native / Expo: fetch().blob() doesn't upload correctly to Supabase
      // Storage. FormData with a typed file descriptor is the reliable approach.
      const formData = new FormData();
      formData.append('file', { uri, name: `avatar.${ext}`, type: mime } as unknown as Blob);

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, formData, { upsert: true });
      if (error) throw new Error(error.message);

      // getPublicUrl is synchronous and never fails — bust cache with a timestamp
      // so the image reloads on every update without a CDN stale-hit.
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);
      await updateMyProfile({ avatarUrl: url });
      await refreshProfile();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePickAvatar = () => {
    const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Camera access is needed to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.85,
          });
          if (!result.canceled) await uploadAndSetAvatar(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Photo library access is needed.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.85,
          });
          if (!result.canceled) await uploadAndSetAvatar(result.assets[0].uri);
        },
      },
    ];
    if (avatarUrl) {
      options.push({
        text: 'Remove Photo',
        style: 'destructive',
        onPress: async () => {
          setAvatarUrl(null);
          await updateMyProfile({ avatarUrl: undefined });
          await refreshProfile();
        },
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', undefined, options);
  };

  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [tradingRegion, setTradingRegion] = useState(profile?.tradingRegion ?? '');
  const [intlTrading, setIntlTrading] = useState(profile?.internationalTradingEnabled ?? false);
  const [allowTradeReqs, setAllowTradeReqs] = useState(profile?.allowTradeRequests ?? true);
  const [allowMsgs, setAllowMsgs] = useState(profile?.allowMessages ?? true);
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile?.profileVisibility ?? 'public');

  // Local discovery (migration 007)
  const [town, setTown] = useState(profile?.town ?? '');
  const [county, setCounty] = useState(profile?.county ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [postcode, setPostcode] = useState(profile?.postcode ?? '');
  const [nearbyDiscovery, setNearbyDiscovery] = useState(profile?.nearbyDiscoveryEnabled ?? false);
  const [preferredRadius, setPreferredRadius] = useState<number>(profile?.preferredRadiusMiles ?? 25);
  const [openToLocal, setOpenToLocal] = useState(profile?.openToLocalTrades ?? false);
  const [openToPostal, setOpenToPostal] = useState(profile?.openToPostalTrades ?? false);
  const [happyToTravel, setHappyToTravel] = useState(profile?.happyToTravel ?? false);

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [geocodingStatus, setGeocodingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [removingLocation, setRemovingLocation] = useState(false);

  const handleRemoveLocation = () => {
    Alert.alert(
      'Remove location?',
      "Your saved location will be deleted and you'll no longer appear in Collectors Nearby. You can set it again anytime by entering your postcode.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const jwt = session?.access_token;
            if (!jwt) return;
            setRemovingLocation(true);
            setGeocodingStatus('idle');
            setGeocodingError(null);
            const err = await clearLocation(jwt);
            if (err) {
              setGeocodingStatus('error');
              setGeocodingError(err);
            } else {
              setPostcode('');
              // The server also disables Nearby discovery when the location is
              // cleared — mirror that locally so the toggle turns off (and a
              // later Save doesn't re-enable it).
              setNearbyDiscovery(false);
              await refreshProfile();
            }
            setRemovingLocation(false);
          },
        },
      ],
    );
  };

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
    setGeocodingStatus('idle');
    setGeocodingError(null);

    try {
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        bio: bio.trim() || undefined,
        avatarUrl: avatarUrl ?? undefined,
        tradingRegion: tradingRegion.trim() || undefined,
        internationalTradingEnabled: intlTrading,
        allowTradeRequests: allowTradeReqs,
        allowMessages: allowMsgs,
        profileVisibility: visibility,
        // Local discovery
        town: town.trim() || undefined,
        county: county.trim() || undefined,
        country: country.trim() || undefined,
        nearbyDiscoveryEnabled: nearbyDiscovery,
        preferredRadiusMiles: preferredRadius,
        openToLocalTrades: openToLocal,
        openToPostalTrades: openToPostal,
        happyToTravel: happyToTravel,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setSaveError(msg.includes('duplicate') || msg.includes('unique') ? 'This username is already taken' : msg);
      setSaving(false);
      return;
    }

    // If the user provided a postcode, geocode it so approx_lat/lng are set
    // and hasLocationSet becomes true (via DB trigger from migration 008).
    const trimmedPostcode = postcode.trim();
    if (trimmedPostcode) {
      const jwt = session?.access_token;
      if (jwt) {
        setGeocodingStatus('loading');
        const geoError = await geocodePostcode(trimmedPostcode, jwt);
        if (geoError) {
          setGeocodingStatus('error');
          setGeocodingError(geoError);
          // Profile saved OK — let user see the error but stay on the screen
          setSaving(false);
          // Refresh profile so other fields are reflected
          await refreshProfile();
          return;
        }
        setGeocodingStatus('success');
        // Refresh profile so hasLocationSet is updated in context
        await refreshProfile();
      }
    }

    setSaving(false);
    router.back();
  };

  const canSave =
    !!username.trim() &&
    !usernameError &&
    usernameAvailable !== false &&
    !checkingUsername &&
    !saving &&
    geocodingStatus !== 'loading';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar picker */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={styles.avatarWrap}>
              <Avatar uri={avatarUrl} name={username || 'Me'} size={90} />
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="camera" size={14} color="#fff" />
                }
              </View>
            </TouchableOpacity>
            <Text style={[styles.avatarHint, { color: colors.mutedForeground }]}>
              Tap to change photo
            </Text>
          </View>

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

          {/* Local trading and discovery */}
          <View
            onLayout={(e) => {
              locationSectionY.current = e.nativeEvent.layout.y;
              maybeScrollToSection();
            }}
          >
            <SectionHeader title="Local Trading & Discovery" />
          </View>

          {/* Postcode geocoding */}
          <Field
            label={profile?.hasLocationSet ? 'Update UK Postcode' : 'UK Postcode'}
            hint={
              profile?.hasLocationSet
                ? 'Your location is set. Enter a new postcode to update it.'
                : 'Enter your postcode so collectors nearby can discover you.'
            }
          >
            <View style={[styles.inputRow, { borderColor: geocodingStatus === 'error' ? colors.destructive : colors.border, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.input, styles.inputFlex, { color: colors.foreground }]}
                value={postcode}
                onChangeText={(v) => {
                  setPostcode(v);
                  if (geocodingStatus !== 'idle') {
                    setGeocodingStatus('idle');
                    setGeocodingError(null);
                  }
                }}
                placeholder={
                  profile?.hasLocationSet && !profile?.postcode
                    ? 'Location already set — enter postcode to update'
                    : 'e.g. WD17 1AB'
                }
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
              />
              {geocodingStatus === 'loading' && <ActivityIndicator size="small" color={colors.mutedForeground} />}
              {geocodingStatus === 'success' && <Feather name="check-circle" size={16} color={colors.owned} />}
              {geocodingStatus === 'error' && <Feather name="x-circle" size={16} color={colors.destructive} />}
              {geocodingStatus === 'idle' && profile?.hasLocationSet && !postcode && (
                <Feather name="map-pin" size={16} color={colors.owned} />
              )}
            </View>
            {geocodingError && (
              <Text style={[styles.fieldError, { color: colors.destructive }]}>{geocodingError}</Text>
            )}
            {profile?.hasLocationSet && (
              <TouchableOpacity
                onPress={handleRemoveLocation}
                disabled={removingLocation}
                style={[styles.removeLocationBtn, { borderColor: colors.destructive + '55' }]}
                activeOpacity={0.7}
              >
                {removingLocation ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <Feather name="x-circle" size={14} color={colors.destructive} />
                    <Text style={[styles.removeLocationText, { color: colors.destructive }]}>
                      Remove location
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Field>

          <Field label="Town / City">
            <TextInput
              style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={town}
              onChangeText={setTown}
              placeholder="e.g. Watford"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
            />
          </Field>

          <Field label="County / Region">
            <TextInput
              style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={county}
              onChangeText={setCounty}
              placeholder="e.g. Hertfordshire"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
            />
          </Field>

          <Field label="Country">
            <TextInput
              style={[styles.input, styles.inputBlock, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={country}
              onChangeText={setCountry}
              placeholder="e.g. England"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
            />
          </Field>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ToggleRow
              label="Appear in Collectors Nearby"
              description="Let nearby collectors discover your profile"
              value={nearbyDiscovery}
              onValueChange={setNearbyDiscovery}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              label="Open to Local Trades"
              description="Happy to meet up and trade in person"
              value={openToLocal}
              onValueChange={setOpenToLocal}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              label="Open to Postal Trades"
              description="Happy to trade by post"
              value={openToPostal}
              onValueChange={setOpenToPostal}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              label="Happy to Travel"
              description="Willing to travel to meet collectors"
              value={happyToTravel}
              onValueChange={setHappyToTravel}
            />
          </View>

          {nearbyDiscovery && (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={[styles.label, { color: colors.foreground }]}>Discovery Radius</Text>
              <View style={styles.radiusRow}>
                {([10, 25, 50, 100] as const).map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setPreferredRadius(r)}
                    style={[
                      styles.radiusPill,
                      {
                        backgroundColor: preferredRadius === r ? colors.primary : colors.card,
                        borderColor: preferredRadius === r ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.radiusPillText, { color: preferredRadius === r ? '#fff' : colors.foreground }]}>
                      {r} mi
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.privacyNote, { backgroundColor: colors.secondary, borderRadius: 10 }]}>
            <Feather name="shield" size={14} color={colors.mutedForeground} />
            <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>
              Your exact location is never shared. Only your town and county are shown to other collectors — approximate distance is shown as a band (e.g. "Within 10 miles"), not a precise figure.
            </Text>
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

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {hint && <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{hint}</Text>}
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
  fieldHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: -2 },
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
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  radiusPillText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  removeLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
  },
  removeLocationText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  privacyNoteText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Avatar picker
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatarWrap: { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 8 },
});
