import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hashPin, isValidPin } from '../utils/pin';
import NumberPad from './NumberPad';
import PinDots from './PinDots';

// The PIN check behind the Resident Mode lock feature (see
// contexts/ResidentLockContext.js) — same numpad/card look and the same
// users/{uid}.pinHash verification as PINEntryScreen, but a plain component
// modal instead of a navigated screen, since locking/unlocking/"let me
// through" checks all need to happen in place on whatever activity screen
// triggered them rather than navigating anywhere.
export default function LockPinModal({ visible, onSuccess, onCancel }) {
  const [digits, setDigits] = useState('');
  // undefined while loading, null if the user has no PIN set up yet
  const [storedHash, setStoredHash] = useState(undefined);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Reset on every open (not just first mount) so a previous attempt's
  // error/digits don't linger into the next time this is triggered.
  useEffect(() => {
    if (!visible) return undefined;
    setDigits('');
    setError('');
    setChecking(false);
    let cancelled = false;
    async function load() {
      const uid = auth.currentUser?.uid;
      const snap = uid ? await getDoc(doc(db, 'users', uid)) : null;
      if (!cancelled) setStoredHash(snap?.data()?.pinHash ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  async function handleDigit(d) {
    if (checking || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length !== 4) return;

    if (!isValidPin(next) || !storedHash) {
      setError('Incorrect PIN');
      setDigits('');
      return;
    }

    setChecking(true);
    const enteredHash = await hashPin(next);
    setChecking(false);
    if (enteredHash === storedHash) {
      onSuccess();
    } else {
      setError('Incorrect PIN');
      setDigits('');
    }
  }

  function handleBackspace() {
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.backdrop} />
        <View style={styles.centerWrap}>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.eyebrow}>PIN REQUIRED</Text>
            <Text style={styles.heading}>Enter your PIN</Text>

            {error ? (
              <Text style={styles.errorBanner} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <PinDots value={digits} />
            <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} disabled={checking} />
          </View>
        </View>
      </View>
    </Modal>
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
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 28,
    paddingTop: 32,
    alignItems: 'center',
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
    marginBottom: 20,
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
    padding: 12,
    marginBottom: 16,
    lineHeight: 22,
    width: '100%',
    textAlign: 'center',
  },
});
