import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Landed on after passing the PIN gate from ModeSelectionScreen. The back
// button navigates straight to ModeSelection (not the default goBack)
// because PINEntryScreen used navigation.reset to get here, so there's no
// previous screen left in history to go back to.
export default function FamilyModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} onPress={() => navigation.navigate('ModeSelection')} />

        <Text style={styles.heading}>Family Mode</Text>
        <Text style={styles.body}>
          Follow along with your loved one's care, activities, and updates.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('FamilyResidents')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="My Residents"
        >
          <Text style={styles.cardTitle}>My Residents</Text>
          <Text style={styles.cardSubtitle}>See who you're connected to</Text>
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
