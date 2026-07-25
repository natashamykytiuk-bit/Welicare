import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
import PasswordField from '../components/PasswordField';
import { auth } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Maps Firebase Auth error codes to messages a user can actually act on,
// instead of showing a generic "something went wrong" for everything.
function getAuthErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function SignInScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function handleSignIn() {
    setError('');
    setUnverified(false);
    setResendSent(false);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!credential.user.emailVerified) {
        // Option A: unverified users are blocked entirely, not just
        // nudged — sign them back out so no session survives on device.
        await signOut(auth);
        setUnverified(true);
        setError('Please verify your email before signing in. Check your inbox for the verification link.');
        return;
      }
      // On success, App.js's onAuthStateChanged listener picks up the
      // signed-in user automatically — no manual navigation needed here.
    } catch (e) {
      setError(getAuthErrorMessage(e.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setResendSent(false);
    setResending(true);
    try {
      // sendEmailVerification needs a live user object, and this screen
      // doesn't have one (we sign out unverified users immediately) — so
      // sign in again just long enough to resend, then sign back out.
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setResendSent(true);
    } catch (e) {
      setError(getAuthErrorMessage(e.code));
    } finally {
      setResending(false);
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

        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.subheading}>Sign in to continue</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {resendSent ? (
          <Text style={styles.successBanner}>
            Verification email sent again. Please check your inbox.
          </Text>
        ) : null}

        {unverified ? (
          <TouchableOpacity
            style={[styles.secondaryButton, resending && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={resending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={resending ? 'Resending…' : 'Resend verification email'}
          >
            <Text style={styles.secondaryButtonText}>
              {resending ? 'Resending…' : 'Resend verification email'}
            </Text>
          </TouchableOpacity>
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

        <Text style={styles.label}>Password</Text>
        <PasswordField
          placeholder="Your password"
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Signing in…' : 'Sign in'}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Signing In…' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchLink}
          onPress={() => navigation.navigate('SignUp')}
          accessibilityRole="link"
        >
          <Text style={styles.switchLinkText}>
            Don't have an account?{' '}
            <Text style={styles.switchLinkBold}>Create one</Text>
          </Text>
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
  successBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 16,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
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
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 56,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
    fontSize: 17,
    letterSpacing: 0.2,
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
  switchLinkBold: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
  },
});
