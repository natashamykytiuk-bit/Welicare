import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the game options on GamesScreen.
export default function WordGamesScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Word Games"
      description="Word puzzles and vocabulary games designed for this resident."
      homeDestination="ModeSelection"
    />
  );
}
