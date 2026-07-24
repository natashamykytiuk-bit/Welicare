import PlaceholderScreen from '../components/PlaceholderScreen';

// Reached from VolunteerModeScreen. No settings gear — that's only on
// VolunteerResidentsScreen, per the screen-flow diagram this app follows.
export default function HourTrackerScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Hour Tracker"
      description="Log and review the hours you've volunteered."
    />
  );
}
