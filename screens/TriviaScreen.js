import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function TriviaScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Trivia"
      description="Fun trivia questions tailored to this resident's era and interests."
      homeDestination="ModeSelection"
    />
  );
}
