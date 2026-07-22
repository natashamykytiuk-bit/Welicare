import { signInWithEmailAndPassword } from 'firebase/auth';
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

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const BORDER = '#BAE6FD';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6B7280';
const ERROR = '#DC2626';
const ERROR_BG = '#FEF2F2';
const ERROR_BORDER = '#FCA5A5';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

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

  async function handleSignIn() {
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(getAuthErrorMessage(e.code));
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

        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.subheading}>Sign in to continue</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#93C5D9"
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
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: BOLD,
    fontSize: 30,
    color: PRIMARY_DARK,
    marginBottom: 6,
  },
  subheading: {
    fontFamily: REGULAR,
    fontSize: 16,
    color: TEXT_MUTED,
    marginBottom: 36,
  },
  errorBanner: {
    fontFamily: REGULAR,
    backgroundColor: ERROR_BG,
    borderColor: ERROR_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    color: ERROR,
    fontSize: 15,
    padding: 14,
    marginBottom: 24,
    lineHeight: 22,
  },
  label: {
    fontFamily: BOLD,
    fontSize: 13,
    color: PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    fontFamily: REGULAR,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    color: PRIMARY_DARK,
    marginBottom: 20,
    minHeight: 52,
  },
  button: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  switchLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchLinkText: {
    fontFamily: REGULAR,
    color: TEXT_MUTED,
    fontSize: 15,
  },
  switchLinkBold: {
    fontFamily: BOLD,
    color: PRIMARY,
  },
});
