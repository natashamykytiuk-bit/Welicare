import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useResidentLock } from '../contexts/ResidentLockContext';
import { colors, fonts, radii } from '../theme';
import BackButton from './BackButton';
import OrgIdBadge from './OrgIdBadge';

// The reusable shell behind most "not built yet" screens: just a title,
// a description, and a "Coming soon" badge. Most screens in this app are
// still placeholders, so this component is what actually renders them —
// see e.g. screens/ActivityIdeasScreen.js for the simplest possible usage.
//
// Optional props add the header icons the screen-flow diagram calls for:
//   - settingsTarget: pass a screen name (e.g. "Settings") to show a gear
//     icon that navigates there.
//   - homeDestination: pass a screen name to show a home icon that routes
//     there. Used by Resident Mode's activity screens (GuidedMeditation,
//     Trivia, PhotoAlbum, WordGames, Molehunt) — every current caller that
//     sets this is one of those, so its presence doubles as "this is a
//     Resident Mode screen" and is what gates the lock-feature behavior
//     below (see contexts/ResidentLockContext.js): while Resident Mode is
//     locked, the home icon requires a PIN instead of navigating straight
//     there. The back button is unaffected by the lock — it only returns
//     to ActivityMenuScreen, not out of Resident Mode, so it's always
//     available; the lock only blocks paths that leave Resident Mode
//     entirely (ActivityMenuScreen's own back/home, and this home icon).
//   - showBack / onBackPress: control or override the default back button.
//   - showOrgId: pass true on Administrator Mode screens to show the
//     signed-in admin's organization ID at the top (see OrgIdBadge).
export default function PlaceholderScreen({
  navigation,
  title,
  description,
  showBack = true,
  onBackPress,
  settingsTarget,
  homeDestination,
  showOrgId,
}) {
  const { locked, requestPin } = useResidentLock();
  const showHeaderRow = showBack || settingsTarget || homeDestination;

  function goHome() {
    // slide_from_left makes this read as a back transition rather than a
    // forward push — see App.js's dynamic animation option on the
    // ModeSelection screen, which every other exit-to-ModeSelection in the
    // app already uses.
    navigation.navigate(homeDestination, { animation: 'slide_from_left' });
  }

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
                  <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              ) : null}
            </View>
            {homeDestination ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => (locked ? requestPin(goHome) : goHome())}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Return to Mode Selection"
              >
                <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {showOrgId ? <OrgIdBadge /> : null}
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
  flex: { flex: 1, backgroundColor: colors.background },
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
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    marginBottom: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.circular,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.primary,
  },
});
