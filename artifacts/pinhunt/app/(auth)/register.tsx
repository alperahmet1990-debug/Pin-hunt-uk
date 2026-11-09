import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
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
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { validateNewPassword } from '@/utils/validatePassword';

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // PinHunt is for adults (utils/legal.ts, "Who can use PinHunt").
  const [isAdult, setIsAdult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and a password.');
      return;
    }
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!isAdult) {
      setError('PinHunt is for collectors aged 18 or over. Please confirm your age.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
    } else if (needsEmailConfirmation) {
      // Email confirmation is enabled in Supabase — show the check-your-email screen.
      setSuccess(true);
    }
    // If needsEmailConfirmation is false the session is already set and
    // AuthGuard will navigate away automatically — no action needed here.
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
          <Image
            source={require('../../assets/images/pinhunt-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>PinHunt</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.heading}>Create account</Text>

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
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.homeMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.homeMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />

          <TouchableOpacity
            style={styles.ageRow}
            onPress={() => setIsAdult(v => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAdult }}
            accessibilityLabel="I'm 18 or over"
          >
            <View style={[styles.ageBox, isAdult && styles.ageBoxOn]}>
              {isAdult && <Feather name="check" size={14} color={colors.homeSurface} />}
            </View>
            <Text style={styles.ageText}>I'm 18 or over</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.homeSurface} />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.agreement}>
            By creating an account you agree to our{' '}
            <Link href="/legal/terms" style={styles.agreementLink}>Terms of Use</Link>
            {' '}and{' '}
            <Link href="/legal/privacy" style={styles.agreementLink}>Privacy Policy</Link>.
          </Text>
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
      backgroundColor: colors.homeBackground,
    },
    successRoot: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xxl,
      gap: spacing.lg,
    },
    successEmoji: { fontSize: 56 },
    successHeading: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.homeInk,
      textAlign: 'center',
    },
    successBody: {
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.homeMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    successEmail: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeInk,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl + spacing.xs,
      paddingVertical: spacing.xxxl,
    },
    brand: {
      alignItems: 'center',
      marginBottom: spacing.xxxl + spacing.sm,
    },
    logo: {
      width: 96,
      height: 96,
      marginBottom: spacing.sm + 2,
    },
    appName: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      color: colors.homeInk,
      letterSpacing: -0.5,
    },
    form: { gap: spacing.md },
    heading: {
      fontSize: 22,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeInk,
      marginBottom: spacing.xs,
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
      shadowColor: colors.homeShadow,
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    buttonDisabled: { opacity: 0.6 },
    ageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginBottom: spacing.sm },
    ageBox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.homeMuted,
      alignItems: 'center', justifyContent: 'center',
    },
    ageBoxOn: { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral },
    ageText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.homeInk },
    agreement: {
      fontSize: 12.5,
      lineHeight: 18,
      fontFamily: 'Inter_400Regular',
      color: colors.homeMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    agreementLink: { fontFamily: 'Inter_600SemiBold', color: colors.homeCoral },
    buttonText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeSurface,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: spacing.xxxl,
    },
    footerText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.homeMuted,
    },
    footerLink: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.homeCoral,
    },
  });
}
