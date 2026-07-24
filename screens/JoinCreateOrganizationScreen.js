import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

const BG = '#ECFEFF';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const TEXT_MUTED = '#6B7280';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// Shown once during onboarding, after PINSetupScreen — but only for
// roles other than Family Caregiver, who skip straight past it (see the
// role check in PINSetupScreen.js).
export default function JoinCreateOrganizationScreen({ navigation }) {
  function handleContinue() {
    navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Join or Create an Organization</Text>
        <Text style={styles.body}>
          Join an existing care organization with an invite code, or create a new one. (Not
          implemented yet — tap Continue to proceed.)
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 56, paddingBottom: 48 },
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
  button: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },
});
