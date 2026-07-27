import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import BackButton from '../components/BackButton';
import PasswordField from '../components/PasswordField';
import { auth } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Reached from PINEntryScreen's "Forgot PIN?" link, carrying the same
// `destination` param PINEntryScreen received. Re-verifies the signed-in
// user's password (not the PIN itself — they've forgotten that) and, on
// success, hands off to PINSetupScreen in "reset" mode to collect a new PIN.
export default function ForgotPinScreen({ navigation, route }) {
  const destination = route?.params?.destination ?? 'ModeSelection';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setError('');
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      navigation.replace('PINSetup', { mode: 'reset', destination });
    } catch (e) {
      // Don't reveal whether the email itself is wrong — this is the
      // already-signed-in user's own account, so the email is fixed.
      setError('Incorrect password. Please try again.');
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

        <Text style={styles.heading}>Forgot your PIN?</Text>
        <Text style={styles.body}>
          Confirm your account password to set a new PIN.
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <Text style={styles.emailValue}>{auth.currentUser?.email}</Text>

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
          onPress={handleVerify}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Verifying…' : 'Verify'}
        >
          <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Verify'}</Text>
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
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 26,
    marginBottom: 24,
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
    marginBottom: 20,
    lineHeight: 22,
    width: '100%',
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  emailValue: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textMuted,
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
});
