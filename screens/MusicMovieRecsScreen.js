import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached from Caregiver Mode's quick links. Distinct from the Resident
// Mode MusicPlayerScreen — this one is AI-generated recommendations for
// a caregiver to browse, not a player for a resident to use directly.
export default function MusicMovieRecsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Music & Movie Recs"
      description="Discover music and movie recommendations based on a resident's era and tastes."
    />
  );
}
