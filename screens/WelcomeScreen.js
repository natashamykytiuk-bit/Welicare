import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const CTA = '#059669';
const TEXT_MUTED = '#6B7280';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// The very first screen a signed-out user sees (App.js's initialRouteName
// for the signed-out stack). Just branding plus links into SignUp/SignIn.
export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.brandMark}>
          <View style={[styles.orb, styles.orbPrimary]} />
          <View style={[styles.orb, styles.orbCta]} />
        </View>
        <Text style={styles.appName}>Welicare</Text>
        <Text style={styles.tagline}>
          Thoughtful activity ideas for the{'\n'}people you care for
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => navigation.navigate('SignUp')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create a new account"
        >
          <Text style={styles.ctaButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineButton}
          onPress={() => navigation.navigate('SignIn')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Sign in to your account"
        >
          <Text style={styles.outlineButtonText}>Sign In</Text>
        </TouchableOpacity>

        <Text style={styles.tagNote}>
          Supporting care teams and families
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 28,
    paddingBottom: 36,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandMark: {
    width: 80,
    height: 80,
    marginBottom: 28,
    position: 'relative',
  },
  orb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    position: 'absolute',
  },
  orbPrimary: {
    backgroundColor: PRIMARY,
    opacity: 0.85,
    top: 0,
    left: 0,
  },
  orbCta: {
    backgroundColor: CTA,
    opacity: 0.85,
    bottom: 0,
    right: 0,
  },
  appName: {
    fontFamily: BOLD,
    fontSize: 34,
    color: PRIMARY_DARK,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  tagline: {
    fontFamily: REGULAR,
    fontSize: 17,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 26,
  },
  actions: {
    gap: 12,
  },
  ctaButton: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    marginHorizontal: 24,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  outlineButton: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: PRIMARY,
    paddingVertical: 18,
    marginHorizontal: 24,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontFamily: BOLD,
    color: PRIMARY,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  tagNote: {
    fontFamily: REGULAR,
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 4,
  },
});
