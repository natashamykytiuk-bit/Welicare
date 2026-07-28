import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function MoviesVideosScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Movies & Videos"
      description="Coming soon — watch films and videos tailored to your interests"
      homeDestination="ModeSelection"
    />
  );
}
