import { useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const BORDER = '#BAE6FD';

// A 4-digit PIN entry field. Visually it's four boxes showing a dot per
// digit typed, but under the hood it's just one hidden TextInput — tapping
// anywhere focuses that input, and the boxes are purely a display of
// `value`. Used by both PINSetupScreen (choosing a PIN) and PINEntryScreen
// (entering one to pass the PIN gate).
export default function PinInput({ value, onChangeText, autoFocus }) {
  const inputRef = useRef(null);
  const digits = [0, 1, 2, 3].map((i) => value[i] ?? '');

  return (
    <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {digits.map((d, i) => (
          <View key={i} style={[styles.box, value.length === i && styles.boxActive]}>
            <Text style={styles.digit}>{d ? '•' : ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        autoFocus={autoFocus}
        style={styles.hiddenInput}
        accessibilityLabel="PIN"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 8,
  },
  box: {
    width: 52,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: PRIMARY },
  digit: { fontSize: 26, color: PRIMARY_DARK },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
