import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Landed on after the PIN gate, same pattern as FamilyModeScreen — see
// the comment there for why the back button targets ModeSelection
// directly instead of using the default goBack.
export default function CaregiverModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton
          navigation={navigation}
          onPress={() => navigation.navigate('ModeSelection', { animation: 'slide_from_left' })}
        />

        <Text style={styles.heading}>Caregiver Mode</Text>
        <Text style={styles.body}>
          Manage residents, track engagement, and find activity ideas.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('CaregiverResidents')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="My Residents"
        >
          <Text style={styles.cardTitle}>My Residents</Text>
          <Text style={styles.cardSubtitle}>View and manage assigned residents</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('OverallStats')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Overall Stats"
        >
          <Text style={styles.cardTitle}>Overall Stats</Text>
          <Text style={styles.cardSubtitle}>Engagement trends across residents</Text>
        </TouchableOpacity>

        {/* The only way into the music and movie libraries that Resident
            Mode plays from, so it stayed when the old quick links went. */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ManageMusic')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Manage Music & Videos"
        >
          <Text style={styles.cardTitle}>Manage Music & Videos</Text>
          <Text style={styles.cardSubtitle}>Curate what residents can play</Text>
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
