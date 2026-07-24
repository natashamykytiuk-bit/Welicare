import PlaceholderScreen from '../components/PlaceholderScreen';

export default function ManageUsersScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Manage Users"
      description="Add, remove, and edit the roles of users in your organization."
      settingsTarget="Settings"
    />
  );
}
