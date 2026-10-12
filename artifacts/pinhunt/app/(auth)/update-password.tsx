import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { validateNewPassword } from '@/utils/validatePassword';

export default function UpdatePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, loading: authLoading, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace('/(tabs)');
  };

  const styles = makeStyles(colors);

  if (authLoading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={colors.homeCoral} />
      </View>
    );
  }

  // No session means the recovery link is missing, used, or expired.
  if (!session) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.heading}>This link has expired</Text>
        <Text style={styles.body}>
          Your password reset link is no longer valid. Request a new one to continue.
        </Text>
        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity style={styles.button} activeOpacity={0.8} accessibilityRole="button">
            <Text style={styles.buttonText}>Forgot password?</Text>
          </TouchableOpacity>
        </Link>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.back} accessibilityRole="link">
            <Text style={styles.link}>Back to sign in</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
          <Text style={styles.heading}>Set a new password</Text>
          <Text style={styles.body}>Choose a new password for your PinHunt account.</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="New password (min 8 characters)"
            placeholderTextColor={colors.homeMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.homeMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={colors.homeSurface} />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.homeBackground },
    centered: {
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl + spacing.xs,
      gap: spacing.md,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl + spacing.xs,
      paddingVertical: spacing.xxxl,
    },
    form: { gap: spacing.md },
    heading: {
      fontSize: 22,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeInk,
    },
    body: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.homeMuted,
      lineHeight: 20,
    },
    error: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.destructive,
      backgroundColor: colors.destructive + '14',
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    input: {
      height: 50,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.homeLine,
      backgroundColor: colors.homeSurface,
      paddingHorizontal: spacing.lg,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.homeInk,
    },
    button: {
      height: 50,
      borderRadius: radius.lg,
      backgroundColor: colors.homeCoral,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeSurface,
    },
    back: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
    link: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeCoral,
    },
  });
}
