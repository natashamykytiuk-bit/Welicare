import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import useActivitySession from '../hooks/useActivitySession';
import { colors, fonts, radii } from '../theme';
import BackButton from './BackButton';
import HomeButton from './HomeButton';
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
//     Trivia, WordGames, Molehunt) — every current caller that
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
//   - activityType / activityId / residentId: pass on Resident Mode
//     activities to log time spent on the screen to activitySessions (see
//     hooks/useActivitySession.js), so even "Coming soon" activities count
//     toward a resident's engagement. Omit activityType to log nothing.
export default function PlaceholderScreen({
  navigation,
  title,
  description,
  showBack = true,
  onBackPress,
  settingsTarget,
  homeDestination,
  showOrgId,
  activityType,
  activityId,
  residentId,
}) {
  // Always called (hooks can't be conditional); enabled turns it off for
  // screens that aren't Resident Mode activities.
  useActivitySession({
    navigation,
    activityType,
    activityId,
    residentId: residentId ?? null,
    enabled: Boolean(activityType),
  });
  const showHeaderRow = showBack || settingsTarget || homeDestination;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {showHeaderRow ? (
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {showBack ? (
                <BackButton
                  navigation={navigation}
                  onPress={onBackPress}
                  style={styles.iconNoMargin}
                />
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
            {/* PIN-gated while Resident Mode is locked — see HomeButton. */}
            {homeDestination ? (
              <HomeButton navigation={navigation} destination={homeDestination} />
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
