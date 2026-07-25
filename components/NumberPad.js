import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'backspace'],
];

// A custom tap-driven number pad for PIN entry, used instead of the device
// keyboard so PIN screens feel consistent across platforms and stay large
// and easy to tap.
export default function NumberPad({ onDigit, onBackspace, disabled }) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key, j) => {
            if (key === null) return <View key={j} style={styles.key} />;
            if (key === 'backspace') {
              return (
                <TouchableOpacity
                  key={j}
                  style={[styles.key, styles.keyButton]}
                  onPress={onBackspace}
                  disabled={disabled}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Backspace"
                >
                  <Ionicons name="backspace-outline" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={j}
                style={[styles.key, styles.keyButton]}
                onPress={() => onDigit(key)}
                disabled={disabled}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Digit ${key}`}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  key: { flex: 1, minHeight: 72 },
  keyButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
});
