import CaregiverResidentsScreen from './CaregiverResidentsScreen';

// Volunteer Mode's "My Residents" — reached from VolunteerModeScreen. The
// same facility-wide list caregivers see (volunteers work with whoever is
// there that day, and firestore.rules let them list their facility's
// residents), opening the same ResidentProfileScreen — which is view-only
// for volunteers: no editing, no photo uploads, and the life story only if
// the organization turned on "Volunteers can view life stories".
export default function VolunteerResidentsScreen({ navigation }) {
  return <CaregiverResidentsScreen navigation={navigation} viewOnly />;
}
