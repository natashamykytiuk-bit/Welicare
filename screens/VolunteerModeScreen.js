import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// Same pattern as FamilyModeScreen/CaregiverModeScreen — landed on after
// the PIN gate, back button targets ModeSelection directly.
export default function VolunteerModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} onPress={() => navigation.navigate('ModeSelection')} />

        <Text style={styles.heading}>Volunteer Mode</Text>
        <Text style={styles.body}>
          Track your volunteer hours and see the residents you work with.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('HourTracker')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Hour Tracker"
        >
          <Text style={styles.cardTitle}>Hour Tracker</Text>
          <Text style={styles.cardSubtitle}>Log and review your volunteer hours</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('VolunteerResidents')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="My Residents"
        >
          <Text style={styles.cardTitle}>My Residents</Text>
          <Text style={styles.cardSubtitle}>See who you volunteer with</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: BOLD,
    fontSize: 26,
    color: PRIMARY_DARK,
    marginBottom: 12,
  },
  body: {
    fontFamily: REGULAR,
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: BOLD,
    fontSize: 18,
    color: PRIMARY_DARK,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: REGULAR,
    fontSize: 14,
    color: PRIMARY,
  },
});
