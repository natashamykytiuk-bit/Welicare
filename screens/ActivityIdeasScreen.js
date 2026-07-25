import AISuggestionsScreen from '../components/AISuggestionsScreen';

// Reached from Caregiver Mode's quick links (no resident context there
// yet, so it falls back to generic suggestions until a resident-picker is
// added to that flow — see AISuggestionsScreen for the fallback).
export default function ActivityIdeasScreen({ navigation, route }) {
  return (
    <AISuggestionsScreen
      navigation={navigation}
      route={route}
      kind="activityIdeas"
      title="Activity Ideas"
      description="Browse personalized activity suggestions tailored to a resident's interests and abilities."
    />
  );
}
