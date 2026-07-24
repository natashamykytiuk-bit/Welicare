import PlaceholderScreen from '../components/PlaceholderScreen';

export default function MusicPlayerScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Music Player"
      description="Play familiar songs and playlists for this resident to enjoy."
      homeDestination="ModeSelection"
    />
  );
}
