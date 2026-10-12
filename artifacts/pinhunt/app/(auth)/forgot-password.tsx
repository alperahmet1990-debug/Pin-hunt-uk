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
import { Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { validateResetEmail } from '@/utils/validateEmail';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const invalid = validateResetEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  const styles = makeStyles(colors);

  if (sent) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.body}>
          If an account exists for that email, we've sent a link to reset your password.
        </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.button} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Back to sign in</Text>
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
          <Text style={styles.heading}>Reset your password</Text>
          <Text style={styles.body}>
            Enter your email and we'll send you a link to reset your password.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.homeMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.homeSurface} />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.back} accessibilityRole="link">
              <Text style={styles.link}>Back to sign in</Text>
            </TouchableOpacity>
          </Link>
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
