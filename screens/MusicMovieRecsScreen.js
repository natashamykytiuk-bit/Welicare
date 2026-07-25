import AISuggestionsScreen from '../components/AISuggestionsScreen';

// Reached from Caregiver Mode's quick links. Distinct from the Resident
// Mode MusicPlayerScreen — this one is AI-generated recommendations for
// a caregiver to browse, not a player for a resident to use directly.
export default function MusicMovieRecsScreen({ navigation, route }) {
  return (
    <AISuggestionsScreen
      navigation={navigation}
      route={route}
      kind="musicMovieRecs"
      title="Music & Movie Recs"
      description="Discover music and movie recommendations based on a resident's era and tastes."
    />
  );
}
