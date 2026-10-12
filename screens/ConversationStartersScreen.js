import AISuggestionsScreen from '../components/AISuggestionsScreen';

// Shared between two flows: Caregiver Mode's quick links (plain back
// button, no resident context) and Resident Mode's activity menu, which
// passes `fromResidentMode: true` and `residentId` via route params.
export default function ConversationStartersScreen({ navigation, route }) {
  return (
    <AISuggestionsScreen
      navigation={navigation}
      route={route}
      kind="conversation"
      title="Conversation Starters"
      description="Ideas for you to adapt: pick what fits, and say it in your own words."
    />
  );
}
