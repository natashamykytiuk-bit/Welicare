import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Same pattern as FamilyModeScreen/CaregiverModeScreen — landed on after
// the PIN gate, back button targets ModeSelection directly.
export default function VolunteerModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton
          navigation={navigation}
          onPress={() => navigation.navigate('ModeSelection', { animation: 'slide_from_left' })}
        />

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
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.primary,
  },
});
