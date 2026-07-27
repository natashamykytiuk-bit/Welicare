import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import NumberPad from '../components/NumberPad';
import PinDots from '../components/PinDots';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hashPin, isValidPin } from '../utils/pin';

const MAX_ATTEMPTS = 5;

// Route names PINEntry gets sent as `destination` don't read well as
// user-facing copy on their own (e.g. "AdministratorMode"), so map the
// ones we know about to a readable label. Anything unrecognized still
// gets a reasonable fallback by splitting on the camelCase boundary.
const DESTINATION_LABELS = {
  FamilyMode: 'Family Mode',
  CaregiverMode: 'Caregiver Mode',
  VolunteerMode: 'Volunteer Mode',
  AdministratorMode: 'Administrator Mode',
  ModeSelection: 'Mode Selection',
};

function destinationLabel(routeName) {
  return DESTINATION_LABELS[routeName] ?? routeName.replace(/([a-z])([A-Z])/g, '$1 $2');
}

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
//
// Presented as a transparentModal (see App.js) so the screen underneath
// stays mounted and visible — that's what shows through the dark overlay
// below, giving the floating-card-over-dimmed-background look.
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
    <View style={styles.container}>
      {/* Dimmed backdrop — a sibling of the centered card (not its parent)
          so the card itself doesn't inherit the backdrop's transparency. */}
      <View style={styles.backdrop} />

      <View style={styles.centerWrap}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
            {storedHash === undefined ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
            ) : (
              <>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
                </View>

                <Text style={styles.eyebrow}>PIN REQUIRED</Text>
                <Text style={styles.heading}>Enter your PIN</Text>
                <Text style={styles.body}>
                  to access <Text style={styles.bodyEmphasis}>{destinationLabel(destination)}</Text>
                </Text>

                {error ? (
                  <Text style={styles.errorBanner} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                <PinDots value={digits} />
                <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} disabled={checking || lockedOut} />

                <TouchableOpacity
                  style={styles.forgotLink}
                  onPress={() => navigation.navigate('ForgotPin', { destination })}
                  accessibilityRole="link"
                  accessibilityLabel="Forgot PIN?"
                >
                  <Text style={styles.forgotLinkText}>Forgot PIN?</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary,
    opacity: 0.55,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '85%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // RN's Yoga defaults flexShrink to 0 (unlike CSS's 1), so without this the
  // ScrollView ignores the card's maxHeight and overflows uncontrollably
  // instead of clipping to it and scrolling its own content internally.
  cardScroll: { flexShrink: 1 },
  cardContent: { padding: 28, paddingTop: 32, alignItems: 'center' },
  loading: { marginTop: 20, marginBottom: 12 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.circular,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.white,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
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
    lineHeight: 26,
    marginBottom: 24,
    textAlign: 'center',
  },
  bodyEmphasis: {
    fontFamily: fonts.sansBold,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 18,
    padding: 14,
    marginBottom: 20,
    lineHeight: 24,
    width: '100%',
    textAlign: 'center',
  },
  forgotLink: {
    marginTop: 20,
    paddingVertical: 10,
  },
  forgotLinkText: {
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    fontSize: 15,
  },
});
