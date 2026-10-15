import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radii } from '../theme';

// A round back-arrow button used at the top of most screens.
// Defaults to popping the current screen off the stack, but callers can
// pass a custom `onPress` when a plain "go back" isn't right — e.g. the
// mode-hub screens (FamilyModeScreen, CaregiverModeScreen, etc.) point it
// straight at ModeSelection instead, since their stack history was reset
// when the PIN gate let them in. Resident Mode screens pass size={60} so the
// button is big enough to see and hit for residents (40 elsewhere, plus
// hitSlop to reach the 44pt minimum).
export default function BackButton({
  navigation,
  style,
  onPress,
  color = colors.textPrimary,
  iconStyle,
  size = 40,
}) {
  return (
    <TouchableOpacity
      style={[styles.button, { width: size, height: size }, style]}
      onPress={onPress ?? (() => navigation.goBack())}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="arrow-back" size={size >= 60 ? 30 : 22} color={color} style={iconStyle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
});
