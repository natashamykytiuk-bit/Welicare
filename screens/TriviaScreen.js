import PlaceholderScreen from '../components/PlaceholderScreen';

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
