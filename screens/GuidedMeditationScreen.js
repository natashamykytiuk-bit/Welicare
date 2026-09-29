import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen. The home icon here
// (via homeDestination) is the same PIN-gated exit as ActivityMenuScreen
// itself — see PlaceholderScreen.js for how that prop works.
export default function GuidedMeditationScreen({ navigation, route }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Guided Meditation & Exercise"
      description="Calming, guided meditation and gentle exercise sessions designed for this resident."
      homeDestination="ModeSelection"
      // Logs time here toward the resident's engagement, see PlaceholderScreen.
      activityType="meditation"
      activityId="guidedMeditation"
      residentId={route?.params?.residentId}
    />
  );
}
