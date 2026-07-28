import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { useResidentLock } from '../contexts/ResidentLockContext';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hasAnyLifeStoryData } from '../utils/lifeStory';

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Conversation Starters passes fromResidentMode so that screen knows to
// show a home icon (gated by the Resident Mode lock, like every other
// activity screen) instead of its normal back-only header.
const ACTIVITIES = [
  { label: 'Guided Meditation & Exercise', screen: 'GuidedMeditation', accent: 'meditation', icon: 'leaf-outline' },
  { label: 'Music Player', screen: 'MusicSelection', accent: 'music', icon: 'musical-notes-outline' },
  { label: 'Games', screen: 'Games', accent: 'games', icon: 'game-controller-outline' },
  { label: 'Trivia', screen: 'Trivia', accent: 'trivia', icon: 'help-circle-outline' },
  { label: 'Photo Album', screen: 'PhotoAlbum', accent: 'photoAlbum', icon: 'images-outline' },
  { label: 'Movies & Videos', screen: 'MoviesSelection', accent: 'moviesVideos', icon: 'film-outline' },
  {
    label: 'Conversation Starters',
    screen: 'ConversationStarters',
    accent: 'conversation',
    icon: 'chatbubbles-outline',
    params: { fromResidentMode: true },
  },
];

// The main hub once a resident (or Guest Mode) has been picked in
// ResidentModeScreen. Header: back (hidden while locked; plain goBack, no
// PIN, while unlocked), resident avatar+name centered, then the lock
// toggle, settings gear (ResidentProfile), and home icon — the latter two
// require a PIN before proceeding while locked, same as the lock toggle
// itself, but don't otherwise change lock state.
export default function ActivityMenuScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const residentName = route?.params?.residentName ?? 'this resident';
  const [resident, setResident] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { locked, toggleLock, requestPin, resetLock } = useResidentLock();

  useEffect(() => {
    let cancelled = false;
    if (!residentId) return undefined;
    getDoc(doc(db, 'residents', residentId)).then((snapshot) => {
      if (!cancelled) setResident(snapshot.data() ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [residentId]);

  // Every fresh resident (or Guest Mode) session starts unlocked, per the
  // lock's session-only design — this only fires on a genuine new mount of
  // this screen (a fresh `navigate('ActivityMenu', ...)` from
  // ResidentModeScreen), not when merely returning here via goBack from an
  // activity screen, since React Navigation keeps this instance alive
  // rather than remounting it for a plain back navigation.
  useEffect(() => {
    resetLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goHome() {
    // animation: 'slide_from_left' makes this read as a back transition
    // rather than a forward push — see App.js's dynamic animation option on
    // the ModeSelection screen and PINEntryScreen's BACK_STYLE_DESTINATIONS
    // for the rest of this pattern, which every other exit-to-ModeSelection
    // in the app already uses.
    navigation.navigate('ModeSelection', { animation: 'slide_from_left' });
  }

  function openSettings() {
    navigation.navigate('ResidentProfile');
  }

  const preferredName =
    resident?.lifeStory?.preferredName || resident?.name?.split(' ')[0] || residentName;
  const showBanner = !!residentId && !bannerDismissed && !hasAnyLifeStoryData(resident?.lifeStory);
  const avatarName = resident?.name || residentName;
  // A real resident is picked (not Guest Mode) whenever residentId is set —
  // greet them by name. In Guest Mode there's no resident to name, and we
  // don't want to expose the account owner's name in a shared/guest session,
  // so the greeting stays name-less.
  const greetingName = residentId ? preferredName : '';

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          {!locked ? (
            <BackButton navigation={navigation} style={styles.iconNoMargin} />
          ) : (
            // Same footprint as BackButton's 40x40 so headerCenter's
            // avatar+name stays centered instead of drifting toward the
            // now-empty left edge — the back button itself is genuinely
            // gone (no goBack, no accessibility target), just its layout
            // slot is preserved.
            <View style={styles.headerBackSpacer} />
          )}
          <View style={styles.headerCenter}>
            <View style={styles.residentAvatar}>
              <Text style={styles.residentAvatarText}>{initialsOf(avatarName)}</Text>
            </View>
            <Text style={styles.residentName} numberOfLines={1}>
              {avatarName}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleLock}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={locked ? 'Unlock screen' : 'Lock screen'}
            >
              <Ionicons
                name={locked ? 'lock-closed-outline' : 'lock-open-outline'}
                size={22}
                color={locked ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => (locked ? requestPin(openSettings) : openSettings())}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit resident info"
            >
              <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => (locked ? requestPin(goHome) : goHome())}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Return to Mode Selection"
            >
              <Ionicons name="home-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {showBanner ? (
          <View style={styles.banner}>
            <View style={styles.bannerAccent} />
            <View style={styles.bannerBody}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons name="sparkles" size={20} color={colors.primary} style={styles.bannerIcon} />
                <Text style={styles.bannerTitle}>Personalize {preferredName}'s experience</Text>
                <TouchableOpacity
                  onPress={() => setBannerDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.bannerSubtext}>
                Complete their profile for tailored activity ideas, conversation starters, and more.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('BuildProfile', { residentId, returnTo: 'ActivityMenu' })
                }
                accessibilityRole="button"
                accessibilityLabel="Complete Profile"
              >
                <Text style={styles.bannerAction}>Complete Profile →</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={styles.heading}>
          {timeGreeting()}{greetingName ? `, ${greetingName}` : ''}.
        </Text>
        <Text style={styles.body}>What would you like to do today?</Text>

        <View style={styles.grid}>
          {ACTIVITIES.map((activity) => {
            const accent = colors.activities[activity.accent];
            return (
              <TouchableOpacity
                key={activity.screen}
                style={[styles.tile, { backgroundColor: accent.bg }]}
                onPress={() => navigation.navigate(activity.screen, { ...activity.params, residentId })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={activity.label}
              >
                <Ionicons name={activity.icon} size={34} color={colors.textPrimary} style={styles.tileIcon} />
                <Text style={styles.tileLabel}>{activity.label}</Text>
              </TouchableOpacity>
            );
          })}
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
    marginBottom: 20,
  },
  iconNoMargin: { marginBottom: 0 },
  headerBackSpacer: { width: 40, height: 40 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  residentAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  residentAvatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
  residentName: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  banner: {
    flexDirection: 'row',
    backgroundColor: colors.mistBackground,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: 20,
  },
  bannerAccent: { width: 3, backgroundColor: colors.primary },
  bannerBody: { flex: 1, padding: 16 },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bannerIcon: { marginRight: 2 },
  bannerTitle: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  bannerSubtext: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 10,
    lineHeight: 22,
  },
  bannerAction: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 32,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 20,
    color: colors.textMuted,
    lineHeight: 28,
    marginBottom: 24,
  },
  // space-between (not a plain `gap`) so the two 47%-wide tiles sit flush
  // against the row's left/right edges with the leftover width becoming
  // one even gap between them — a fixed `gap` here left that leftover
  // trailing after the second tile instead, making the right-hand margin
  // visibly wider than the left. rowGap keeps the vertical spacing between
  // wrapped rows without affecting horizontal distribution.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  // Fixed width (not flexGrow) so every tile stays at half the row's width
  // regardless of label length or how many tiles land in the last row — a
  // lone tile in an odd-numbered last row no longer stretches to fill the
  // full row width the way flexGrow did. Fixed height for the same reason:
  // sized to fit the longest label ("Guided Meditation & Exercise") at up
  // to 3 lines; a short label like "Games" just centers with more space
  // around it.
  tile: {
    width: '48.5%',
    height: 132,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tileIcon: { flexShrink: 0 },
  tileLabel: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
});
