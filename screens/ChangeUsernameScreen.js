import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import BackButton from '../components/BackButton';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { normalizeUsername } from '../utils/username';
import { isValidUsername } from '../utils/validation';

// Reached from Settings' "Change Username" row. Usernames are unique across
// the whole app via the public usernames/{normalized} lookup collection
// (see firestore.rules), so changing one means claiming the new key,
// updating the display value on the user doc, then releasing the old key —
// in that order, so a failure partway never leaves the account without a
// claimed username at all.
export default function ChangeUsernameScreen({ navigation }) {
  // undefined while loading, then the current username string (or '' if
  // somehow unset)
  const [currentUsername, setCurrentUsername] = useState(undefined);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadUsername() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      if (!cancelled) setCurrentUsername(snap.data()?.username ?? '');
    }
    loadUsername();
    return () => {
      cancelled = true;
    };
  }, []);

  const usernameError =
    username.length > 0 && !isValidUsername(username)
      ? 'Only letters, numbers, periods, and underscores are allowed.'
      : '';

  async function handleSave() {
    setError('');
    setSuccess(false);
    if (!username) {
      setError('Please enter a new username.');
      return;
    }
    if (!isValidUsername(username)) {
      setError('Username can only contain letters, numbers, periods, and underscores.');
      return;
    }

    const newKey = normalizeUsername(username);
    const oldKey = normalizeUsername(currentUsername || '');
    if (newKey === oldKey) {
      setError('That is already your username.');
      return;
    }

    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const existing = await getDoc(doc(db, 'usernames', newKey));
      if (existing.exists()) {
        setError('This username is already taken.');
        return;
      }

      // Claim the new key first, then flip the display value, then
      // release the old key — if any step throws, we stop immediately
      // (see catch below) rather than guessing what partially landed.
      await setDoc(doc(db, 'usernames', newKey), {
        uid,
        email: auth.currentUser.email,
      });
      await updateDoc(doc(db, 'users', uid), { username });
      if (oldKey) {
        await deleteDoc(doc(db, 'usernames', oldKey));
      }

      setCurrentUsername(username);
      setUsername('');
      setSuccess(true);
    } catch (e) {
      console.log('Change username error:', e);
      setError('Something went wrong. Please try again.');
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

        <Text style={styles.heading}>Change your username</Text>
        <Text style={styles.body}>
          Choose a new username — it must be unique across all of Welicare.
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {success ? (
          <Text style={styles.successBanner}>Your username has been updated.</Text>
        ) : null}

        <Text style={styles.label}>Current username</Text>
        {currentUsername === undefined ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loading} />
        ) : (
          <Text style={styles.currentValue}>{currentUsername || '—'}</Text>
        )}

        <Text style={styles.label}>New username</Text>
        <TextInput
          style={[styles.input, usernameError && styles.inputError]}
          placeholder="Choose a new username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="username-new"
          value={username}
          onChangeText={setUsername}
          accessibilityLabel="New username"
        />
        {usernameError ? <Text style={styles.fieldError}>{usernameError}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Saving…' : 'Save username'}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving…' : 'Save username'}</Text>
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
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  loading: { alignSelf: 'flex-start', marginBottom: 20 },
  currentValue: {
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
