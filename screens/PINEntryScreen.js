import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import BackButton from '../components/BackButton';
import NumberPad from '../components/NumberPad';
import PinDots from '../components/PinDots';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hashPin, isValidPin } from '../utils/pin';

const MAX_ATTEMPTS = 5;

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// The single reusable PIN gate. Every entry point (Family/Caregiver/
// Volunteer/Administrator Mode, and Resident Mode's exit) navigates here
// with a `destination` route param saying where to go on success — see
// ModeSelectionScreen.js and ResidentModeScreen.js for the callers.
export default function PINEntryScreen({ navigation, route }) {
  const destination = route?.params?.destination ?? 'ModeSelection';
  const [digits, setDigits] = useState('');
  // undefined while loading, null if the user has no PIN set up yet
  const [storedHash, setStoredHash] = useState(undefined);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const uid = auth.currentUser?.uid;
      const snap = uid ? await getDoc(doc(db, 'users', uid)) : null;
      if (cancelled) return;
      setStoredHash(snap?.data()?.pinHash ?? null);
      setDisplayName(snap?.data()?.fullName || snap?.data()?.username || 'your account');
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lockedOut = attempts >= MAX_ATTEMPTS;

  async function handleDigit(d) {
    if (checking || lockedOut || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length !== 4) return;

    if (!isValidPin(next) || !storedHash) {
      setError('No PIN has been set up for this account yet.');
      setDigits('');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const enteredHash = await hashPin(next);
      if (enteredHash === storedHash) {
        // navigation.reset (not navigate) clears everything before this
        // screen, so e.g. leaving Resident Mode can't be undone by just
        // pressing back afterward.
        navigation.reset({ index: 0, routes: [{ name: destination }] });
        return;
      }
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setDigits('');
      setError(
        nextAttempts >= MAX_ATTEMPTS
          ? 'Too many incorrect attempts. Please try again later.'
          : 'Incorrect PIN. Please try again.'
      );
    } finally {
      setChecking(false);
    }
  }

  function handleBackspace() {
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />

        {storedHash === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
            </View>
            <Text style={styles.heading}>Enter your PIN</Text>
            <Text style={styles.body}>to sign in as {displayName}</Text>

            {error ? (
              <Text style={styles.errorBanner} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <PinDots value={digits} />
            <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} disabled={checking || lockedOut} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  loading: { marginTop: 20 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.circular,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
    alignSelf: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.white,
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: 24,
    textAlign: 'center',
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
});
