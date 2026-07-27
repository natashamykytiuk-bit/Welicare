import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import BackButton from '../components/BackButton';
import { auth } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Reached from SignInScreen's "Forgot password?" link, optionally carrying
// the email the user had already typed there. Always shows the same
// generic success message regardless of whether the account exists, so
// this can't be used to probe which emails are registered.
export default function ForgotPasswordScreen({ navigation, route }) {
  const [email, setEmail] = useState(route?.params?.email ?? '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setError('');
    setSuccess(false);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccess(true);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // Same outcome as success, so this can't reveal whether the
        // account exists.
        setSuccess(true);
      } else if (e.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton navigation={navigation} />

        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.subheading}>
          Enter your email and we'll send you a link to reset your password.
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {success ? (
          <Text style={styles.successBanner}>
            If an account exists for that email, we've sent a password reset link. Check your inbox.
          </Text>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email address"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Sending…' : 'Send reset link'}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchLink}
          onPress={() => navigation.goBack()}
          accessibilityRole="link"
        >
          <Text style={styles.switchLinkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 30,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 36,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 16,
    padding: 14,
    marginBottom: 24,
    lineHeight: 22,
  },
  successBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 16,
    padding: 14,
    marginBottom: 24,
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 20,
    minHeight: 56,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  switchLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchLinkText: {
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    fontSize: 15,
  },
});
