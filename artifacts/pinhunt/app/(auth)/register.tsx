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

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and a password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await signUp(email.trim(), password, displayName);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess(true);
    }
  };

  const styles = makeStyles(colors);

  if (success) {
    return (
      <View style={[styles.root, styles.successRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.successEmoji}>✉️</Text>
        <Text style={styles.successHeading}>Check your email</Text>
        <Text style={styles.successBody}>
          We've sent a confirmation link to{'\n'}
          <Text style={styles.successEmail}>{email.trim()}</Text>
          {'\n\n'}Tap the link to verify your account, then come back to sign in.
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
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>📌</Text>
          <Text style={styles.appName}>PinHunt UK</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.heading}>Create account</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Display name (optional)"
            placeholderTextColor={colors.mutedForeground}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.mutedForeground}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}> Sign in</Text>
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
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    successRoot: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      gap: 16,
    },
    successEmoji: { fontSize: 56 },
    successHeading: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      textAlign: 'center',
    },
    successBody: {
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      lineHeight: 22,
    },
    successEmail: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 32,
    },
    brand: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logo: {
      fontSize: 48,
      marginBottom: 10,
    },
    appName: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    form: { gap: 12 },
    heading: {
      fontSize: 22,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginBottom: 4,
    },
    error: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    input: {
      height: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
    },
    button: {
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primaryForeground,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 32,
    },
    footerText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    footerLink: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
  });
}
