import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import PinInput from '../components/PinInput';
import { auth, db } from '../firebaseConfig';
import { hashPin, isValidPin } from '../utils/pin';

const BG = '#ECFEFF';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const TEXT_MUTED = '#6B7280';
const ERROR = '#DC2626';
const ERROR_BG = '#FEF2F2';
const ERROR_BORDER = '#FCA5A5';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

export default function PINSetupScreen({ navigation }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setError('');
    if (!isValidPin(pin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      const pinHash = await hashPin(pin);
      await setDoc(doc(db, 'users', uid), { pinHash }, { merge: true });
      const snap = await getDoc(doc(db, 'users', uid));
      const role = snap.data()?.role;
      const nextScreen = role === 'Family Caregiver' ? 'ModeSelection' : 'JoinCreateOrganization';
      navigation.reset({ index: 0, routes: [{ name: nextScreen }] });
    } catch (e) {
      console.log('PIN setup error:', e);
      setError('Something went wrong saving your PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Create Your PIN</Text>
        <Text style={styles.body}>
          Set a 4-digit PIN. You'll use it to switch between modes and exit Resident Mode.
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Enter PIN</Text>
        <PinInput value={pin} onChangeText={setPin} autoFocus />

        <Text style={[styles.label, styles.labelSpacing]}>Confirm PIN</Text>
        <PinInput value={confirmPin} onChangeText={setConfirmPin} />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Saving PIN…' : 'Continue'}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 56, paddingBottom: 48 },
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
  label: {
    fontFamily: BOLD,
    fontSize: 13,
    color: PRIMARY_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: 'center',
  },
  labelSpacing: { marginTop: 28 },
  button: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 32,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },
});
