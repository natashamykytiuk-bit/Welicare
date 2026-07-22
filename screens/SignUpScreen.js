import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import PasswordField from '../components/PasswordField';
import { auth, db } from '../firebaseConfig';
import { getPasswordRules, isPasswordValid, isValidUsername } from '../utils/validation';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const BORDER = '#BAE6FD';
const TEXT_MUTED = '#6B7280';
const ERROR = '#DC2626';
const ERROR_BG = '#FEF2F2';
const ERROR_BORDER = '#FCA5A5';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

const ROLES = [
  'Healthcare Provider',
  'Family Caregiver',
  'Volunteer',
  'Paid Companion',
  'Other',
];

const PASSWORD_RULE_LABELS = [
  ['length', 'At least 8 characters'],
  ['uppercase', 'One uppercase letter'],
  ['lowercase', 'One lowercase letter'],
  ['number', 'One number'],
  ['special', 'One special character'],
  ['noSpaces', 'No spaces'],
];

function getAuthErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email is already registered.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password does not meet the requirements below.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function PasswordRule({ met, label }) {
  return (
    <View style={styles.ruleRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={15}
        color={met ? CTA : '#9CA3AF'}
      />
      <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{label}</Text>
    </View>
  );
}

export default function SignUpScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameError =
    username.length > 0 && !isValidUsername(username)
      ? 'Only letters, numbers, periods, and underscores are allowed.'
      : '';
  const passwordRules = getPasswordRules(password);
  const confirmError =
    confirmPassword.length > 0 && password !== confirmPassword
      ? 'Passwords do not match.'
      : '';

  async function handleSignUp() {
    setError('');
    if (!email || !role || !username || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (!isValidUsername(username)) {
      setError('Username can only contain letters, numbers, periods, and underscores.');
      return;
    }
    if (!isPasswordValid(password)) {
      setError('Password does not meet the requirements below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        email: email.trim(),
        username,
        role,
        createdAt: serverTimestamp(),
      });
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

        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subheading}>Join Welicare today</Text>

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

        <Text style={styles.label}>Role</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={role}
            onValueChange={setRole}
            style={styles.picker}
            accessibilityLabel="Select your role"
          >
            <Picker.Item label="Select your role…" value="" color="#93C5D9" />
            {ROLES.map((r) => (
              <Picker.Item key={r} label={r} value={r} color={PRIMARY_DARK} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={[styles.input, usernameError && styles.inputError]}
          placeholder="Choose a username"
          placeholderTextColor="#93C5D9"
          autoCapitalize="none"
          autoComplete="username-new"
          value={username}
          onChangeText={setUsername}
          accessibilityLabel="Username"
        />
        {usernameError ? <Text style={styles.fieldError}>{usernameError}</Text> : null}

        <Text style={styles.label}>Password</Text>
        <PasswordField
          placeholder="At least 8 characters"
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password"
        />
        {password.length > 0 ? (
          <View style={styles.rulesBox}>
            {PASSWORD_RULE_LABELS.map(([key, label]) => (
              <PasswordRule key={key} met={passwordRules[key]} label={label} />
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Confirm Password</Text>
        <PasswordField
          placeholder="Repeat your password"
          autoComplete="password-new"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          accessibilityLabel="Confirm password"
          error={confirmError}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Creating account…' : 'Create account'}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating Account…' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchLink}
          onPress={() => navigation.navigate('SignIn')}
          accessibilityRole="link"
        >
          <Text style={styles.switchLinkText}>
            Already have an account?{' '}
            <Text style={styles.switchLinkBold}>Sign in</Text>
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
  inputError: {
    borderColor: ERROR,
    marginBottom: 6,
  },
  fieldError: {
    fontFamily: REGULAR,
    color: ERROR,
    fontSize: 13,
    marginBottom: 14,
    marginLeft: 2,
  },
  pickerWrapper: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 52,
    justifyContent: 'center',
  },
  picker: { color: PRIMARY_DARK },
  rulesBox: {
    marginTop: -10,
    marginBottom: 20,
    gap: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    fontFamily: REGULAR,
    fontSize: 13,
    color: '#9CA3AF',
  },
  ruleTextMet: {
    color: CTA,
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
