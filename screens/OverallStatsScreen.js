import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached from CaregiverModeScreen.
export default function OverallStatsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Overall Stats"
      description="See engagement trends and activity stats across all your residents."
      settingsTarget="Settings"
    />
  );
}
