import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

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
  sectionLabel: {
    fontFamily: BOLD,
    fontSize: 13,
    color: PRIMARY,
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
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  quickLinkChipText: {
    fontFamily: BOLD,
    fontSize: 14,
    color: PRIMARY_DARK,
  },
});
