import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen. The home icon here
// (via homeDestination) is the same PIN-gated exit as ActivityMenuScreen
// itself — see PlaceholderScreen.js for how that prop works.
export default function GuidedMeditationScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Guided Meditation"
      description="Calming, guided meditation sessions designed for this resident."
      homeDestination="ModeSelection"
    />
  );
}
