// @ts-check
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

// Shared "that didn't load" block with a Try again button, used wherever a
// screen's initial Firestore load can fail (ModeSelection,
// JoinCreateOrganization, AddResident, BuildProfile). One component so the
// wording and look stay consistent — the copy is deliberately warm and
// non-technical, since the people seeing it are care staff, families and
// sometimes residents. The real error is console.error'd by the screen
// itself, where it knows the screen name.
//
// Props:
//   onRetry  — re-runs the screen's load. Required; the button is the
//              whole point of the component.
//   message  — optional override for the default sentence.
//   style    — optional extra container style (e.g. spacing).
/**
 * @param {object} props
 * @param {() => void} props.onRetry
 * @param {string} [props.message]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 */
export default function LoadError({ onRetry, message, style }) {
  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
      <Text style={styles.message}>
        {message ?? "We couldn't load this just now. Please check your connection and try again."}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onRetry}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 20,
    marginVertical: 16,
  },
  message: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 23,
  },
  // Same look as the app's primary buttons, sized for a 56pt target.
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 28,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
  },
});
