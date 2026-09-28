import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useResidentLock } from '../contexts/ResidentLockContext';
import { colors, radii } from '../theme';

// The round home icon on Resident Mode activity screens: leaves Resident
// Mode for `destination` (normally "ModeSelection"). Shared by
// PlaceholderScreen and GameShell so the lock behaviour lives in one place.
//
// Resident Mode lock (contexts/ResidentLockContext.js): while locked, this
// asks for the PIN first instead of navigating straight away, because it's
// a way OUT of Resident Mode. (Back buttons on these screens aren't gated —
// they only return to the activity menu, which stays inside Resident Mode.)
export default function HomeButton({ navigation, destination = 'ModeSelection' }) {
  const { locked, requestPin } = useResidentLock();

  function goHome() {
    // slide_from_left makes this read as a back transition rather than a
    // forward push — see App.js's dynamic animation option on the
    // ModeSelection screen, which every other exit-to-ModeSelection in the
    // app already uses.
    navigation.navigate(destination, { animation: 'slide_from_left' });
  }

  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={() => (locked ? requestPin(goHome) : goHome())}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Return to Mode Selection"
    >
      <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
