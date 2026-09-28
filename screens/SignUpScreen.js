import { Ionicons } from '@expo/vector-icons';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
import Dropdown from '../components/Dropdown';
import PasswordField from '../components/PasswordField';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { createPersonalOrganization } from '../utils/inviteCode';
import { nextOnboardingRoute } from '../utils/onboarding';
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

// Two modes, one form:
// - Sign-up (the "SignUp" route, signed out): the full form.
// - Finish setting up (the "FinishSignUp" route, signed in): shown by
//   App.js when someone is signed in and verified but has no users/{uid}
//   profile — i.e. an earlier sign-up stopped after creating the Auth
//   account. Same fields minus email/password (they already have those),
//   so they can complete the account instead of being stuck with "email
//   already in use".
export default function SignUpScreen({ navigation, route }) {
  const finishSetup = route?.params?.finishSetup === true;
  const isTablet = useIsTablet();
  // Set when sign-up hits auth/email-already-in-use, to show a sign-in link.
  const [emailInUse, setEmailInUse] = useState(false);
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
    confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match.' : '';

  // Writes the parts of an account that live in Firestore: the users/{uid}
  // profile (with the role), the username claim, and — for Family
  // Caregivers — their personal organization. Shared by a fresh sign-up
  // and by "finish setting up" (see finishSetup above), which is how an
  // account whose profile never got written can be completed later.
  // Throws { usernameTaken: true } if the username was claimed in the
  // meantime; any other error is a plain Firestore error.
  async function writeProfile(user, emailAddress) {
    const usernameKey = normalizeUsername(username);
    // setDoc without merge on a doc that doesn't exist is a *create*, and
    // firestore.rules only allow the role to be set on create — so this can
    // never change the role of an existing profile.
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: emailAddress,
      fullName,
      username,
      country,
      role,
      createdAt: serverTimestamp(),
    });

    try {
      // Also create-only in the rules, which is what catches the race where
      // someone else claimed the same username between the availability
      // check and this write.
      // Only the account id — the email is never stored in this public
      // lookup (sign-in by username asks the server for it instead).
      await setDoc(doc(db, 'usernames', usernameKey), { uid: user.uid });
    } catch (claimError) {
      console.log('Username claim error:', claimError);
      // Undo the profile so the account is back in the "no profile yet"
      // state and can be finished (or retried) with another username.
      await deleteDoc(doc(db, 'users', user.uid)).catch((e) =>
        console.error('[SignUp] could not undo profile after username clash:', e)
      );
      throw { usernameTaken: true };
    }

    // Family Caregivers aren't part of a care facility, but still need
    // an orgId for org-scoped features (e.g. Music) to work the same
    // way for them as everyone else — see createPersonalOrganization.
    // This is what lets them skip JoinCreateOrganizationScreen entirely
    // (nextOnboardingRoute treats a set orgId as "done"). Best-effort: a
    // failure here shouldn't block the account — they'd just fall back to
    // the join/create/skip step.
    if (role === 'Family Caregiver') {
      try {
        await createPersonalOrganization();
      } catch (orgError) {
        console.error('Personal organization creation failed:', orgError);
      }
    }
  }

  function validate({ needsCredentials }) {
    if (!fullName || !username || !country || !role) return 'Please fill in all fields.';
    if (needsCredentials && (!email || !password || !confirmPassword)) {
      return 'Please fill in all fields.';
    }
    if (!isValidUsername(username)) {
      return 'Username can only contain letters, numbers, periods, and underscores.';
    }
    if (needsCredentials && !isPasswordValid(password)) {
      return 'Password does not meet the requirements below.';
    }
    if (needsCredentials && password !== confirmPassword) return 'Passwords do not match.';
    return '';
  }

  async function usernameIsFree() {
    const snap = await getDoc(doc(db, 'usernames', normalizeUsername(username)));
    return !snap.exists();
  }

  // A brand-new sign-up. Order: Auth account → profile → verification email.
  // Only creating the Auth account can "fail the sign-up"; once it exists,
  // a later failure never strands the person — see the comments below.
  async function handleSignUp() {
    setError('');
    setEmailInUse(false);
    const invalid = validate({ needsCredentials: true });
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    try {
      if (!(await usernameIsFree())) {
        setError('This username is already taken.');
        return;
      }

      let credential;
      try {
        credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          // Usually someone whose earlier sign-up stopped partway. Signing
          // in picks up where they left off (App.js routes an account with
          // no profile to FinishSignUp).
          setEmailInUse(true);
          setError('It looks like you started signing up before — sign in to finish setting up.');
          return;
        }
        throw e;
      }

      let setupIncomplete = false;
      try {
        await writeProfile(credential.user, email.trim());
      } catch (e) {
        if (e?.usernameTaken) {
          // Nothing else was saved for this account yet, so remove the Auth
          // account too and let them simply try again with another name.
          await deleteUser(credential.user).catch((err) =>
            console.error('[SignUp] could not remove account after username clash:', err)
          );
          setError('This username was just taken — please choose another and try again.');
          return;
        }
        // The Auth account exists but the profile didn't save. Don't fail
        // the sign-up: carry on to verification, and after verifying App.js
        // sends them to FinishSignUp to enter these details again.
        console.error(
          '[SignUp] profile write failed; will finish after sign-in:',
          e.code,
          e.message,
          e
        );
        setupIncomplete = true;
      }

      // A failed verification email must not fail the sign-up either — the
      // verification screen has a "Resend verification email" button.
      let verificationSendFailed = false;
      try {
        await sendEmailVerification(credential.user);
      } catch (e) {
        console.error('[SignUp] verification email failed to send:', e.code, e.message, e);
        verificationSendFailed = true;
      }

      navigation.navigate('EmailVerification', {
        email: email.trim(),
        setupIncomplete,
        verificationSendFailed,
      });
    } catch (e) {
      console.log('Sign up error:', e);
      setError(getAuthErrorMessage(e.code));
    } finally {
      setLoading(false);
    }
  }

  // "Finish setting up" — for a signed-in, verified account that has no
  // profile yet (its original sign-up stopped after the Auth account was
  // made). Only ever creates a missing profile: if one exists by now, it
  // moves on without touching it, so an existing role can't be changed.
  async function handleFinishSetup() {
    setError('');
    const invalid = validate({ needsCredentials: false });
    if (invalid) {
      setError(invalid);
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const existing = await getDoc(doc(db, 'users', user.uid));
      if (existing.exists()) {
        navigation.reset({ index: 0, routes: [{ name: nextOnboardingRoute(existing.data()) }] });
        return;
      }
      if (!(await usernameIsFree())) {
        setError('This username is already taken.');
        return;
      }
      await writeProfile(user, user.email ?? '');
      const saved = await getDoc(doc(db, 'users', user.uid));
      navigation.reset({ index: 0, routes: [{ name: nextOnboardingRoute(saved.data()) }] });
    } catch (e) {
      if (e?.usernameTaken) {
        setError('This username was just taken — please choose another and try again.');
      } else {
        console.error('[SignUp] finish setup failed:', e.code, e.message, e);
        setError(
          "We couldn't save your details just now. Please check your connection and try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <>
      {/* Finish-setup mode is the first screen after sign-in, so there's
          nothing to go back to — it offers Sign out instead (at the end). */}
      {!finishSetup ? (
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
        </>
      ) : null}

      <Text style={styles.stepIndicator}>
        {finishSetup ? 'STEP 1 OF 3 — FINISH SETTING UP' : 'STEP 1 OF 3 — CREATE ACCOUNT'}
      </Text>
      <Text style={styles.heading}>
        {finishSetup ? 'Finish setting up your account' : 'Create Account'}
      </Text>
      <Text style={styles.subheading}>
        {finishSetup
          ? 'Your sign-in is ready — we just need a few details to finish.'
          : 'Join Welicare today'}
      </Text>

      {error ? (
        <Text style={styles.errorBanner} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {emailInUse ? (
        <TouchableOpacity
          style={styles.switchLinkTop}
          onPress={() => navigation.navigate('SignIn')}
          accessibilityRole="link"
          accessibilityLabel="Sign in to finish setting up"
        >
          <Text style={styles.switchLinkText}>
            <Text style={styles.switchLinkBold}>Sign in to finish setting up →</Text>
          </Text>
        </TouchableOpacity>
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

      {/* Email and password already exist in finish-setup mode. */}
      {!finishSetup ? (
        <>
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
        </>
      ) : null}

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

      {!finishSetup ? (
        <>
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
        </>
      ) : null}

      <Text style={styles.label}>Country</Text>
      <Dropdown
        label="Country"
        value={country}
        onValueChange={setCountry}
        options={COUNTRIES}
        placeholder="Select your country…"
        accessibilityLabel="Select your country"
      />

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
        onPress={finishSetup ? handleFinishSetup : handleSignUp}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={loading ? 'Saving…' : 'Continue'}
      >
        <Text style={styles.buttonText}>
          {loading ? (finishSetup ? 'Saving…' : 'Creating Account…') : 'Continue →'}
        </Text>
      </TouchableOpacity>

      {finishSetup ? (
        <TouchableOpacity
          style={styles.switchLinkTop}
          onPress={() => signOut(auth)}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.switchLinkText}>
            Not you? <Text style={styles.switchLinkBold}>Sign out</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
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
