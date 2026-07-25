import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// These are the screens that existed before the mode-based navigation
// restructure — kept reachable here as quick links rather than deleted.
const QUICK_LINKS = [
  { label: 'Add Resident', screen: 'AddResident' },
  { label: 'Resident Profile', screen: 'ResidentProfile' },
  { label: 'Activity Ideas', screen: 'ActivityIdeas' },
  { label: 'Conversation Starters', screen: 'ConversationStarters' },
  { label: 'Music & Movie Recs', screen: 'MusicMovieRecs' },
  { label: 'Family Feed', screen: 'FamilyFeed' },
];

// Landed on after the PIN gate, same pattern as FamilyModeScreen — see
// the comment there for why the back button targets ModeSelection
// directly instead of using the default goBack.
export default function CaregiverModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} onPress={() => navigation.navigate('ModeSelection')} />

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

        <Text style={styles.sectionLabel}>Quick Links</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickLinksContent}
        >
          {QUICK_LINKS.map((link) => (
            <TouchableOpacity
              key={link.screen}
              style={styles.quickLinkChip}
              onPress={() => navigation.navigate(link.screen)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={link.label}
            >
              <Text style={styles.quickLinkChipText}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 12,
  },
  quickLinksContent: {
    gap: 10,
    paddingRight: 4,
  },
  quickLinkChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.circular,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLinkChipText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
