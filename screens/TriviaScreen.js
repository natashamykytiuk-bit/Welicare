import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function TriviaScreen({ navigation, route }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Trivia"
      description="Fun trivia questions tailored to this resident's era and interests."
      homeDestination="ModeSelection"
      // Logs time here toward the resident's engagement, see PlaceholderScreen.
      activityType="trivia"
      activityId="trivia"
      residentId={route?.params?.residentId}
    />
  );
}
