import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fonts, radii } from '../theme';

// Shown once during onboarding, after PINSetupScreen, for every role —
// skipping is always available via the link at the bottom rather than a
// role-based routing shortcut.
export default function JoinCreateOrganizationScreen({ navigation }) {
  function handleSkip() {
    navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.stepIndicator}>STEP 3 OF 3</Text>
        <Text style={styles.heading}>Join or create an organization</Text>
        <Text style={styles.body}>Connect to your care facility to start using Welicare.</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('JoinOrganization')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Join an organization"
        >
          <Ionicons name="business-outline" size={28} color={colors.primary} style={styles.cardIcon} />
          <Text style={styles.cardTitle}>Join an organization</Text>
          <Text style={styles.cardBody}>Enter the invite code your administrator sent you.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('CreateOrganization')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create an organization"
        >
          <Ionicons name="people-outline" size={28} color={colors.primary} style={styles.cardIcon} />
          <Text style={styles.cardTitle}>Create an organization</Text>
          <Text style={styles.cardBody}>Set up a new Welicare facility for your care home.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipLink}
          onPress={handleSkip}
          accessibilityRole="link"
          accessibilityLabel="Skip this step"
        >
          <Text style={styles.skipLinkText}>Skip this step →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 56, paddingBottom: 48 },
  stepIndicator: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
  },
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
    marginBottom: 16,
  },
  cardIcon: { marginBottom: 10 },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  skipLinkText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textMuted,
  },
});
