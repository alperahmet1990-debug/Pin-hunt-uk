/**
 * Delete account confirmation — pushed from the Profile tab (#14).
 * In-app confirmation (not Alert): see .agents/memory/expo-web-action-confirmations.md.
 */
import React, { useState } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { radius, spacing } from '@/constants/theme';
import {
  DELETE_CONFIRM_WORD,
  isDeleteConfirmed,
  requestAccountDeletion,
} from '@/utils/deleteAccount';

const DELETED_ITEMS = [
  'Your profile, username and avatar',
  'Your collection, wishlist (ISO), for-trade list and boards',
  'Your trade listings, community posts and messages',
  'Your pin submissions and contributed images',
];

const ERROR_MESSAGES = {
  not_allowed: "This account can't be deleted in the app. Please contact PinHunt support.",
  retry: "We couldn't delete your account. Please check your connection and try again.",
} as const;

export default function DeleteAccountScreen() {
  const colors = useColors();
  const { session, signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof ERROR_MESSAGES | null>(null);

  const canConfirm = isDeleteConfirmed(typed) && !busy;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const outcome = await requestAccountDeletion(session?.access_token);
    if (outcome === 'deleted' || outcome === 'unauthorized') {
      // Signing out clears the session; AuthGuard then lands on the login screen.
      await signOut();
      return;
    }
    setError(outcome);
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.homeBackground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
          <Text style={[styles.title, { color: colors.destructive }]}>Delete your account?</Text>
          <Text style={[styles.body, { color: colors.homeInk }]}>
            This permanently deletes your PinHunt account and cannot be undone. We will delete:
          </Text>
          {DELETED_ITEMS.map(item => (
            <Text key={item} style={[styles.item, { color: colors.homeInk }]}>• {item}</Text>
          ))}
          <Text style={[styles.label, { color: colors.homeMuted }]}>
            Type {DELETE_CONFIRM_WORD} to confirm
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            editable={!busy}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={DELETE_CONFIRM_WORD}
            placeholderTextColor={colors.homeMuted}
            accessibilityLabel={`Type ${DELETE_CONFIRM_WORD} to confirm`}
            style={[styles.input, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
          />
          {error && (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
              {ERROR_MESSAGES[error]}
            </Text>
          )}
          <TouchableOpacity
            onPress={confirm}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            accessibilityState={{ disabled: !canConfirm }}
            style={[styles.button, { backgroundColor: colors.destructive, opacity: canConfirm ? 1 : 0.4 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.destructiveForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.destructiveForeground }]}>
                {error === 'retry' ? 'Try again' : 'Delete my account'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: 10 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  item: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, paddingLeft: 4 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  button: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
