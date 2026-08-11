import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
import { colors, fonts, radii } from '../theme';
import { createPersonalOrganization } from '../utils/inviteCode';
import { useIsTablet } from '../utils/responsive';
import { normalizeUsername } from '../utils/username';
import { getPasswordRules, isPasswordValid, isValidUsername } from '../utils/validation';

// The `value` stored on the user doc must match the role checks in
// ModeSelectionScreen.js (which mode each role can see) and
// JoinCreateOrganizationScreen.js — only the card `label` is renamed for
// display ("Family Member" reads better than "Family Caregiver" here).
const ROLE_CARDS = [
  {
    value: 'Family Caregiver',
    label: 'Family Member',
    description: "Track your loved one's wellbeing and activity history",
  },
  {
    value: 'Caregiver',
    label: 'Caregiver',
    description: "Run sessions and manage residents' profiles",
  },
  {
    value: 'Volunteer',
    label: 'Volunteer',
    description: 'Lead activity sessions and log your hours',
  },
  {
    value: 'Administrator',
    label: 'Administrator',
    description: 'Manage staff, residents, and facility settings',
  },
];

const COUNTRIES = ['Canada', 'United States', 'United Kingdom', 'Australia', 'Other'];

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
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
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
        color={met ? colors.primary : colors.textMuted}
      />
      <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{label}</Text>
    </View>
  );
}

function RoleCard({ role, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.roleCard, selected && styles.roleCardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={role.label}
    >
      <Text style={[styles.roleCardTitle, selected && styles.roleCardTitleSelected]}>
        {role.label}
      </Text>
      <Text style={[styles.roleCardDescription, selected && styles.roleCardDescriptionSelected]}>
        {role.description}
      </Text>
    </TouchableOpacity>
  );
}

export default function SignUpScreen({ navigation }) {
  const isTablet = useIsTablet();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [country, setCountry] = useState('');
  const [role, setRole] = useState('');
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
    if (!fullName || !email || !username || !password || !confirmPassword || !country || !role) {
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
      const usernameKey = normalizeUsername(username);
      const usernameSnap = await getDoc(doc(db, 'usernames', usernameKey));
      if (usernameSnap.exists()) {
        setError('This username is already taken.');
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        email: email.trim(),
        fullName,
        username,
        country,
        role,
        createdAt: serverTimestamp(),
      });

      try {
        // No merge: an unmerged setDoc is only permitted by firestore.rules
        // as a `create`, which only succeeds while no document exists at
        // this path yet — so this is also what catches the race where
        // someone else claimed the same username in between the
        // availability check above and this write.
        await setDoc(doc(db, 'usernames', usernameKey), {
          uid: credential.user.uid,
          email: email.trim(),
        });
      } catch (claimError) {
        console.log('Username claim error:', claimError);
        await deleteUser(credential.user);
        setError('This username was just taken — please choose another and try again.');
        return;
      }

      // Family Caregivers aren't part of a care facility, but still need
      // an orgId for org-scoped features (e.g. Music) to work the same
      // way for them as everyone else — see createPersonalOrganization.
      // This is what lets them skip JoinCreateOrganizationScreen entirely
      // (App.js's needsOrg check already treats a set orgId as "done").
      // Best-effort: a failure here shouldn't block account creation —
      // they'd just fall back to the existing skip-this-step flow.
      if (role === 'Family Caregiver') {
        try {
          await createPersonalOrganization();
        } catch (orgError) {
          console.error('Personal organization creation failed:', orgError);
        }
      }

      await sendEmailVerification(credential.user);
      navigation.navigate('EmailVerification', { email: email.trim() });
    } catch (e) {
      console.log('Sign up error:', e);
      setError(getAuthErrorMessage(e.code));
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <>
      <BackButton navigation={navigation} />

      <TouchableOpacity
        style={styles.switchLinkTop}
        onPress={() => navigation.navigate('SignIn')}
        accessibilityRole="link"
      >
        <Text style={styles.switchLinkText}>
          Already have one? <Text style={styles.switchLinkBold}>Sign in instead</Text>
        </Text>
      </TouchableOpacity>

      <Text style={styles.stepIndicator}>STEP 1 OF 3 — CREATE ACCOUNT</Text>
      <Text style={styles.heading}>Create Account</Text>
      <Text style={styles.subheading}>Join Welicare today</Text>

      {error ? (
        <Text style={styles.errorBanner} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Your full name"
        placeholderTextColor={colors.textMuted}
        autoComplete="name"
        value={fullName}
        onChangeText={setFullName}
        accessibilityLabel="Full name"
      />

      <Text style={styles.label}>Email Address</Text>
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

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={[styles.input, usernameError && styles.inputError]}
        placeholder="Choose a username"
        placeholderTextColor={colors.textMuted}
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

      <Text style={styles.label}>Country</Text>
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={country}
          onValueChange={setCountry}
          style={styles.picker}
          accessibilityLabel="Select your country"
        >
          <Picker.Item label="Select your country…" value="" color={colors.textMuted} />
          {COUNTRIES.map((c) => (
            <Picker.Item key={c} label={c} value={c} color={colors.textPrimary} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>I am a...</Text>
      <View style={styles.roleGrid}>
        {ROLE_CARDS.map((r) => (
          <RoleCard
            key={r.value}
            role={r}
            selected={role === r.value}
            onPress={() => setRole(r.value)}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={loading ? 'Creating account…' : 'Continue'}
      >
        <Text style={styles.buttonText}>{loading ? 'Creating Account…' : 'Continue →'}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.splitContainer, !isTablet && styles.splitContainerPhone]}>
        {isTablet ? (
          <View style={styles.brandPanel}>
            <Text style={styles.logo}>Welicare</Text>
            <Text style={styles.tagline}>Bringing joy to every day</Text>
          </View>
        ) : null}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {form}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  splitContainer: { flex: 1, flexDirection: 'row' },
  splitContainerPhone: { flexDirection: 'column' },
  brandPanel: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.white,
    marginBottom: 8,
  },
  tagline: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.white,
    opacity: 0.85,
  },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  switchLinkTop: { paddingVertical: 4, marginBottom: 12 },
  switchLinkText: {
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    fontSize: 15,
  },
  switchLinkBold: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
  },
  stepIndicator: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
  },
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
    marginBottom: 28,
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
  inputError: {
    borderColor: colors.destructive,
    marginBottom: 6,
  },
  fieldError: {
    fontFamily: fonts.sansRegular,
    color: colors.destructive,
    fontSize: 13,
    marginBottom: 14,
    marginLeft: 2,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: { color: colors.textPrimary },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  roleCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 16,
  },
  roleCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleCardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  roleCardTitleSelected: { color: colors.white },
  roleCardDescription: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  roleCardDescriptionSelected: { color: colors.white, opacity: 0.9 },
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
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
  },
  ruleTextMet: {
    color: colors.primary,
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
    fontFamily: fonts.serifBold,
    color: colors.white,
    fontSize: 17,
    letterSpacing: 0.2,
  },
});
