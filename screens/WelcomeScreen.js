import { Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

// The very first screen a signed-out user sees (App.js's initialRouteName
// for the signed-out stack). Just branding plus links into SignUp/SignIn.
export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        {/* The Welicare logo (the same image as the splash screen). */}
        <Image
          source={require('../assets/welicare-logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Welicare"
        />
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

        <Text style={styles.tagNote}>Supporting care teams and families</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    paddingBottom: 36,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 773×248 image, kept at that shape.
  logo: { width: 260, height: 83, marginBottom: 12 },
  tagline: {
    fontFamily: fonts.sansRegular,
    fontSize: 17,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 26,
  },
  actions: {
    gap: 12,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
    marginHorizontal: 24,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  outlineButton: {
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingVertical: 18,
    marginHorizontal: 24,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  tagNote: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
