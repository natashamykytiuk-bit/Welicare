import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
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
import { auth, functions } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

const callDeleteAccount = httpsCallable(functions, 'deleteAccount');

// Reached from Settings' "Delete Account" row. The actual cleanup happens
// in the deleteAccount Cloud Function (see functions/index.js for exactly
// what's removed): a real organization's residents are kept and deleted
// separately via OrganizationalSettingsScreen, and the function refuses
// outright for an organization's sole administrator.
//
// A full screen with a password field rather than a confirm Alert: Alert
// buttons don't fire on web (the same problem that broke remove-resident
// before), and re-entering the password both confirms intent and proves
// it's the account owner, not just whoever picked up a signed-in iPad.
export default function DeleteAccountScreen({ navigation }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setError('');
    if (!password) {
      setError('Please enter your password to confirm.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await callDeleteAccount();
      // The Auth account is already gone server-side; signing out clears
      // the local session so the auth listener in App.js routes back to
      // the login stack. No navigation call needed here.
      await signOut(auth);
    } catch (e) {
      console.log('Delete account error:', e);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('That password is incorrect.');
      } else if (e.code === 'functions/failed-precondition') {
        // deleteAccount refuses when this is the organization's only
        // administrator — nothing was deleted, so point them to the fix.
        setError(
          "You're the only administrator of your organization. Go to Settings → Organizational Settings and make someone else the administrator (or delete the organization) first."
        );
      } else if (e.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong and your account was not deleted. Please try again.');
      }
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

        <Text style={styles.heading}>Delete your account</Text>
        <Text style={styles.body}>This permanently deletes your Welicare account. It can't be undone.</Text>
        <Text style={styles.body}>
          {'• Your login, username and profile are removed.\n'}
          {"• If you use Welicare at home (a personal organization), your residents and their life stories are deleted too.\n"}
          {'• In a care organization, residents stay with the organization — you are just removed as their caregiver.\n'}
          {"• If you're an organization's only administrator, you'll need to make someone else the administrator first."}
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password to confirm"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Deleting account…' : 'Permanently delete account'}
        >
          <Text style={styles.buttonText}>{loading ? 'Deleting…' : 'Permanently delete account'}</Text>
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
    marginBottom: 20,
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
  // Destructive red rather than the usual primary, so it's unmistakably
  // not a routine save button.
  button: {
    backgroundColor: colors.destructive,
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
