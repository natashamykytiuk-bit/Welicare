import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached two ways: from Caregiver Mode's quick links, and from
// ResidentModeScreen's "Add Resident" option.
export default function AddResidentScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Add Resident"
      description="Add a new resident profile to keep track of their interests, routines, and care notes."
    />
  );
}
