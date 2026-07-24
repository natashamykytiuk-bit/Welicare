import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function GamesScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Games"
      description="Simple, engaging games designed for this resident."
      homeDestination="ModeSelection"
    />
  );
}
