import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached from Caregiver Mode's quick links, and from ActivityMenuScreen's
// settings gear (as the "edit this resident's info" destination).
export default function ResidentProfileScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Resident Profile"
      description="View and edit a resident's life story, preferences, and care history."
    />
  );
}
