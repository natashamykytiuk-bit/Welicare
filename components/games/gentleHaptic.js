import * as Haptics from 'expo-haptics';

// The light "well done" tap every Resident Mode game plays on a success
// (see the game rules in CLAUDE.md). Never allowed to break a game:
// devices or browsers without haptics just skip it.
export default function gentleHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
