import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';

// Four circle indicators showing PIN entry progress — filled once a digit
// has been typed in that position. Purely a display of `value`; pair with
// NumberPad for the actual tap-driven input.
export default function PinDots({ value, length = 4 }) {
  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: radii.circular,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
