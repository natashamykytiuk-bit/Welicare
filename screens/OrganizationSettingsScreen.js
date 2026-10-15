import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Reached from SettingsScreen's "Connecting with a Care Home" row, which
// only shows for a Family Caregiver on their family organization (the
// personal one made at sign-up — see createPersonalOrganization).
//
// This screen used to hold two forms: join an organization with its invite
// code, or turn the family organization into a real one. Both are gone on
// purpose (owner decision, Oct 2026): a family account never becomes a
// member of a care home — members see every resident there — and a family
// organization stays one family's own. A family member connects to a care
// home one resident at a time instead, in Family Mode → My Residents:
//   - with a family code, for someone who already lives there;
//   - with "Move to an organization", for someone they've been looking
//     after at home who is moving in.
// So this is now a short explanation pointing there. It deliberately has no
// button into My Residents: that screen sits behind Family Mode's PIN, and
// Settings must not be a way around it.
export default function OrganizationSettingsScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading} accessibilityRole="header">
          Connecting with a care home
        </Text>
        <Text style={styles.body}>
          Your family account stays your own. To connect with a care home that uses Welicare, you
          link one person at a time from Family Mode → My Residents.
        </Text>

        <View style={styles.card}>
          <Ionicons name="key-outline" size={26} color={colors.primary} style={styles.cardIcon} />
          <Text style={styles.cardTitle}>They already live there</Text>
          <Text style={styles.cardBody}>
            Ask the care team for a family code and enter it in My Residents. You’ll be able to see
            their profile and share photos for their album.
          </Text>
        </View>

        <View style={styles.card}>
          <Ionicons
            name="business-outline"
            size={26}
            color={colors.primary}
            style={styles.cardIcon}
          />
          <Text style={styles.cardTitle}>They’re moving in</Text>
          <Text style={styles.cardBody}>
            In My Residents, find the person you’ve been caring for at home and choose “Move to an
            organization”. Once the care home approves, its caregivers and administrators keep the
            profile up to date; you can still view it and share photos.
          </Text>
        </View>
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
    marginTop: 8,
    marginBottom: 16,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 16,
  },
  cardIcon: { marginBottom: 10 },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 23,
  },
});
