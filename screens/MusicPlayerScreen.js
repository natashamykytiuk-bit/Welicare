import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen. Distinct from the
// Caregiver Mode MusicMovieRecsScreen — this one is a player for the
// resident, not an AI-recommendation browser for the caregiver.
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
