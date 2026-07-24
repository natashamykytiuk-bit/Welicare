import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import PinInput from '../components/PinInput';
import { auth, db } from '../firebaseConfig';
import { hashPin, isValidPin } from '../utils/pin';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const TEXT_MUTED = '#6B7280';
const ERROR = '#DC2626';
const ERROR_BG = '#FEF2F2';
const ERROR_BORDER = '#FCA5A5';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

const MAX_ATTEMPTS = 5;

// The single reusable PIN gate. Every entry point (Family/Caregiver/
// Volunteer/Administrator Mode, and Resident Mode's exit) navigates here
// with a `destination` route param saying where to go on success — see
// ModeSelectionScreen.js and ResidentModeScreen.js for the callers.
export default function PINEntryScreen({ navigation, route }) {
  const destination = route?.params?.destination ?? 'ModeSelection';
  const [pin, setPin] = useState('');
  // undefined while loading, null if the user has no PIN set up yet
  const [storedHash, setStoredHash] = useState(undefined);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  // Load the hash to check against as soon as this screen mounts.
  useEffect(() => {
    let cancelled = false;
    async function loadHash() {
      const uid = auth.currentUser?.uid;
      const snap = uid ? await getDoc(doc(db, 'users', uid)) : null;
      if (!cancelled) setStoredHash(snap?.data()?.pinHash ?? null);
    }
    loadHash();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleContinue() {
    setError('');
    if (!isValidPin(pin)) {
      setError('Enter your 4-digit PIN.');
      return;
    }
    if (!storedHash) {
      setError('No PIN has been set up for this account yet.');
      return;
    }
    setChecking(true);
    try {
      const enteredHash = await hashPin(pin);
      if (enteredHash === storedHash) {
        // navigation.reset (not navigate) clears everything before this
        // screen, so e.g. leaving Resident Mode can't be undone by just
        // pressing back afterward.
        navigation.reset({ index: 0, routes: [{ name: destination }] });
        return;
      }
      // Wrong PIN: clear the input and count the attempt toward lockout.
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPin('');
      setError(
        nextAttempts >= MAX_ATTEMPTS
          ? 'Too many incorrect attempts. Please try again later.'
          : 'Incorrect PIN. Please try again.'
      );
    } finally {
      setChecking(false);
    }
  }

  const lockedOut = attempts >= MAX_ATTEMPTS;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />

        <Text style={styles.heading}>Enter PIN</Text>
        <Text style={styles.body}>Enter your 4-digit PIN to continue.</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {storedHash === undefined ? (
          <ActivityIndicator size="large" color={PRIMARY} style={styles.loading} />
        ) : (
          <>
            <PinInput value={pin} onChangeText={setPin} autoFocus />

            <TouchableOpacity
              style={[styles.button, (checking || lockedOut) && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={checking || lockedOut}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={checking ? 'Checking…' : 'Continue'}
            >
              <Text style={styles.buttonText}>{checking ? 'Checking…' : 'Continue'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: BOLD,
    fontSize: 26,
    color: PRIMARY_DARK,
    marginBottom: 12,
  },
  body: {
    fontFamily: REGULAR,
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 24,
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
    marginBottom: 20,
    lineHeight: 22,
  },
  loading: { marginTop: 20 },
  button: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },
});
