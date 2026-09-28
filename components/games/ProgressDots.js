import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../../theme';

// A row of dots that fill in as a round goes on (moles found, phrases
// finished, …). It only counts up, never down, so there is nothing to
// "run out" of (see the game rules in CLAUDE.md). `label` is what screen
// readers hear, e.g. "3 of 5 moles found".
export default function ProgressDots({ done, total, label }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < done && styles.dotDone]} />
      ))}
    </View>
  );
}

const accent = colors.activities.games;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 28 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radii.circular,
    borderWidth: 3,
    borderColor: accent.icon,
  },
  dotDone: { backgroundColor: accent.icon },
});
