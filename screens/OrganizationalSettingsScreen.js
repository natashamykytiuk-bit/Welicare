import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached from AdministratorModeScreen.
export default function OrganizationalSettingsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Organizational Settings"
      description="Configure organization-wide preferences, branding, and policies."
      settingsTarget="Settings"
    />
  );
}
