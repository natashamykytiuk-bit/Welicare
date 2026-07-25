import { sendEmailVerification, signOut } from 'firebase/auth';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Reached right after sign-up. The account already exists in Firebase Auth
// at this point, but App.js's onAuthStateChanged treats an unverified user
// as signed-out, so this screen lives in the signed-out stack alongside
// Welcome/SignUp/SignIn until the user proves they own the email address.
export default function EmailVerificationScreen({ route, onVerified }) {
  const email = route?.params?.email ?? 'your email address';
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resendSent, setResendSent] = useState(false);

  async function handleCheckVerified() {
    setError('');
    setResendSent(false);
    const user = auth.currentUser;
    if (!user) {
      setError('Your session expired. Please sign up again.');
      return;
    }
    setChecking(true);
    try {
      // reload() pulls the latest emailVerified flag from Firebase — the
      // locally cached user object doesn't update on its own when the
      // user verifies in a separate browser tab.
      await user.reload();
      if (user.emailVerified) {
        // Hands control back to App.js, which flips its `user` state and
        // routes into PINSetup now that verification is confirmed.
        onVerified?.();
      } else {
        setError("Your email hasn't been verified yet. Please check your inbox.");
      }
    } catch (e) {
      console.log('Email verification check error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  async function handleResend() {
    setError('');
    setResendSent(false);
    const user = auth.currentUser;
    if (!user) {
      setError('Your session expired. Please sign up again.');
      return;
    }
    setResending(true);
    try {
      await sendEmailVerification(user);
      setResendSent(true);
    } catch (e) {
      console.log('Resend verification error:', e);
      setError('Could not resend the email. Please try again in a moment.');
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.content}>
        <Text style={styles.heading}>Verify your email</Text>
        <Text style={styles.body}>
          We've sent a verification email to{' '}
          <Text style={styles.emailText}>{email}</Text>. Please check your
          inbox and click the link to verify your account.
        </Text>

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

        <TouchableOpacity
          style={[styles.button, checking && styles.buttonDisabled]}
          onPress={handleCheckVerified}
          disabled={checking}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={checking ? 'Checking…' : "I've verified my email"}
        >
          <Text style={styles.buttonText}>
            {checking ? 'Checking…' : "I've verified my email"}
          </Text>
        </TouchableOpacity>

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

        <TouchableOpacity
          style={styles.switchLink}
          onPress={handleSignOut}
          accessibilityRole="button"
        >
          <Text style={styles.switchLinkText}>
            Wrong email?{' '}
            <Text style={styles.switchLinkBold}>Sign out</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, justifyContent: 'center' },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 30,
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 28,
    textAlign: 'center',
  },
  emailText: {
    fontFamily: fonts.sansBold,
    color: colors.textPrimary,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 15,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
  },
  successBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 15,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
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
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  secondaryButtonText: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
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
