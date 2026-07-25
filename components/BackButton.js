import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

const PRIMARY_DARK = '#164E63';
const BORDER = '#BAE6FD';

// A round back-arrow button used at the top of most screens.
// Defaults to popping the current screen off the stack, but callers can
// pass a custom `onPress` when a plain "go back" isn't right — e.g. the
// mode-hub screens (FamilyModeScreen, CaregiverModeScreen, etc.) point it
// straight at ModeSelection instead, since their stack history was reset
// when the PIN gate let them in.
export default function BackButton({ navigation, style, onPress, color = PRIMARY_DARK, iconStyle }) {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress ?? (() => navigation.goBack())}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="arrow-back" size={22} color={color} style={iconStyle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
});
