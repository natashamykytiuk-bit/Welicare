import PlaceholderScreen from '../components/PlaceholderScreen';

// This screen is shared between two flows: Caregiver Mode's quick links
// (plain back button) and Resident Mode's activity menu, which passes
// `fromResidentMode: true` via route params so the PIN-gated home icon
// shows up instead.
export default function ConversationStartersScreen({ navigation, route }) {
  const fromResidentMode = route?.params?.fromResidentMode;
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Conversation Starters"
      description="Find thoughtful conversation prompts to help spark meaningful moments together."
      homeDestination={fromResidentMode ? 'ModeSelection' : undefined}
    />
  );
}
