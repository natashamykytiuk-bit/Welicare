import PlaceholderScreen from '../components/PlaceholderScreen';

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
