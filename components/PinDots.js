import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';

// Four circle indicators showing PIN entry progress — filled once a digit
// has been typed in that position. Purely a display of `value`; pair with
// NumberPad for the actual tap-driven input.
export default function PinDots({ value, length = 4 }) {
  return (
    // One element for VoiceOver, so it hears progress instead of nothing;
    // the live region makes Android announce each change too.
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${value.length} of ${length} digits entered`}
      accessibilityLiveRegion="polite"
    >
      {Array.from({ length }).map((_, i) => (
        <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 13,
    height: 13,
    borderRadius: radii.circular,
    borderWidth: 2,
    // textMuted, not border: the faint border was ~1.3:1, below the 3:1 UI minimum.
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
