import PlaceholderScreen from '../components/PlaceholderScreen';

// Caregiver Mode's "My Residents" — reached from CaregiverModeScreen.
export default function CaregiverResidentsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="My Residents"
      description="View and manage the residents assigned to you."
      settingsTarget="Settings"
    />
  );
}
