import PlaceholderScreen from '../components/PlaceholderScreen';

// The target of every settings-gear icon across the app (ModeSelection,
// the *ResidentsScreen/OverallStats/ManageUsers/OrganizationalSettings
// screens). One shared destination rather than a separate settings
// screen per mode.
export default function SettingsScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Settings"
      description="Manage your account details, notifications, and app preferences."
    />
  );
}
