import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import NumberPad from '../components/NumberPad';
import PinDots from '../components/PinDots';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hashPin } from '../utils/pin';

// Shown once, right after sign-up (App.js routes here via the
// justSignedUp flag). Collects a 4-digit PIN twice via a tap-driven
// number pad (to catch typos), hashes it, and saves it to this user's
// Firestore doc — PINEntryScreen later reads that same field to verify
// PIN attempts. Every role continues to JoinCreateOrganization next; the
// "Skip this step" option lives on that screen instead.
//
// Also reused for PIN reset: ForgotPinScreen navigates here with
// `mode: 'reset'` and a `destination` after re-verifying the user's
// password, in which case saving lands back on `destination` instead of
// continuing the onboarding flow.
export default function PINSetupScreen({ navigation, route }) {
  const mode = route?.params?.mode ?? 'onboarding';
  const destination = route?.params?.destination;
  const [stage, setStage] = useState('enter'); // 'enter' | 'confirm'
  const [firstPin, setFirstPin] = useState('');
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDigit(d) {
    if (loading || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length !== 4) return;

    if (stage === 'enter') {
      setFirstPin(next);
      setTimeout(() => {
        setDigits('');
        setStage('confirm');
      }, 150);
      return;
    }

    if (next !== firstPin) {
      setError('PINs do not match. Please start over.');
      setTimeout(() => {
        setDigits('');
        setFirstPin('');
        setStage('enter');
      }, 150);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      const pinHash = await hashPin(next);
      await setDoc(doc(db, 'users', uid), { pinHash }, { merge: true });
      if (mode === 'reset' && destination) {
        navigation.reset({ index: 0, routes: [{ name: destination }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'JoinCreateOrganization' }] });
      }
    } catch (e) {
      console.log('PIN setup error:', e);
      setError('Something went wrong saving your PIN. Please try again.');
      setDigits('');
      setFirstPin('');
      setStage('enter');
    } finally {
      setLoading(false);
    }
  }

  function handleBackspace() {
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {mode !== 'reset' ? (
          <Text style={styles.stepIndicator}>STEP 2 OF 3 — SET YOUR PIN</Text>
        ) : null}
        <Text style={styles.heading}>{mode === 'reset' ? 'Set a new PIN' : 'Set your PIN'}</Text>
        <Text style={styles.body}>
          {mode === 'reset'
            ? 'Choose a new PIN to protect staff and family modes on this device.'
            : 'This PIN protects staff and family modes on the device.'}
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.stageLabel}>
          {stage === 'enter' ? 'Enter PIN' : 'Confirm PIN'}
        </Text>
        <PinDots value={digits} />

        <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} disabled={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 56, paddingBottom: 48 },
  stepIndicator: {
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
    marginBottom: 12,
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
    fontSize: 18,
    padding: 14,
    marginBottom: 20,
    lineHeight: 24,
  },
  stageLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
