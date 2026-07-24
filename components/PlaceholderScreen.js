import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from './BackButton';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// The reusable shell behind most "not built yet" screens: just a title,
// a description, and a "Coming soon" badge. Most screens in this app are
// still placeholders, so this component is what actually renders them —
// see e.g. screens/ActivityIdeasScreen.js for the simplest possible usage.
//
// Optional props add the header icons the screen-flow diagram calls for:
//   - settingsTarget: pass a screen name (e.g. "Settings") to show a gear
//     icon that navigates there.
//   - homeDestination: pass a screen name to show a home icon that routes
//     through the PIN gate (PINEntryScreen) before landing there. Used by
//     Resident Mode screens, which require a PIN to exit.
//   - showBack / onBackPress: control or override the default back button.
export default function PlaceholderScreen({
  navigation,
  title,
  description,
  showBack = true,
  onBackPress,
  settingsTarget,
  homeDestination,
}) {
  const showHeaderRow = showBack || settingsTarget || homeDestination;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {showHeaderRow ? (
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {showBack ? (
                <BackButton navigation={navigation} onPress={onBackPress} style={styles.iconNoMargin} />
              ) : null}
              {settingsTarget ? (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => navigation.navigate(settingsTarget)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                >
                  <Ionicons name="settings-outline" size={20} color={PRIMARY_DARK} />
                </TouchableOpacity>
              ) : null}
            </View>
            {homeDestination ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigation.navigate('PINEntry', { destination: homeDestination })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Return to Mode Selection"
              >
                <Ionicons name="home-outline" size={20} color={PRIMARY_DARK} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.body}>{description}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Coming soon</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconNoMargin: { marginBottom: 0 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
  },
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
    marginBottom: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  badgeText: {
    fontFamily: REGULAR,
    fontSize: 13,
    color: PRIMARY,
  },
});
