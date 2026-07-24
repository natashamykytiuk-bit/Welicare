import PlaceholderScreen from '../components/PlaceholderScreen';

// Volunteer Mode's "My Residents" — reached from VolunteerModeScreen.
export default function VolunteerResidentsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="My Residents"
      description="See the residents you volunteer with."
      settingsTarget="Settings"
    />
  );
}
