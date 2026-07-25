import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { auth, db } from '../firebaseConfig';
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
// show the PIN-gated home icon instead of its normal back-only header.
const ACTIVITIES = [
  { label: 'Guided Meditation & Exercise', screen: 'GuidedMeditation', accent: 'meditation', icon: 'leaf-outline' },
  { label: 'Music Player', screen: 'MusicSelection', accent: 'music', icon: 'musical-notes-outline' },
  { label: 'Games', screen: 'Games', accent: 'games', icon: 'game-controller-outline' },
  { label: 'Trivia', screen: 'Trivia', accent: 'trivia', icon: 'help-circle-outline' },
  { label: 'Photo Album', screen: 'PhotoAlbum', accent: 'photoAlbum', icon: 'images-outline' },
  {
    label: 'Conversation Starters',
    screen: 'ConversationStarters',
    accent: 'conversation',
    icon: 'chatbubbles-outline',
    params: { fromResidentMode: true },
  },
];

// The main hub once a resident (or Guest Mode) has been picked in
// ResidentModeScreen. Header: back (to ResidentModeScreen), resident
// avatar+name centered, settings gear (to ResidentProfile, for editing
// this resident's info — not the global SettingsScreen), and home
// (PIN-gated exit to ModeSelection, same as ResidentModeScreen).
export default function ActivityMenuScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const residentName = route?.params?.residentName ?? 'this resident';
  const [resident, setResident] = useState(null);
  const [caregiverFirstName, setCaregiverFirstName] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    getDoc(doc(db, 'users', uid)).then((snapshot) => {
      if (cancelled) return;
      const name = snapshot.data()?.fullName || snapshot.data()?.username || '';
      setCaregiverFirstName(name.split(' ')[0] || '');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const preferredName =
    resident?.lifeStory?.preferredName || resident?.name?.split(' ')[0] || residentName;
  const showBanner = !!residentId && !bannerDismissed && !hasAnyLifeStoryData(resident?.lifeStory);
  const avatarName = resident?.name || residentName;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
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
              onPress={() => navigation.navigate('ResidentProfile')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit resident info"
            >
              <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('PINEntry', { destination: 'ModeSelection' })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Return to Mode Selection"
            >
              <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {showBanner ? (
          <View style={styles.banner}>
            <View style={styles.bannerAccent} />
            <View style={styles.bannerBody}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons name="sparkles" size={18} color={colors.primary} style={styles.bannerIcon} />
                <Text style={styles.bannerTitle}>Personalize {preferredName}'s experience</Text>
                <TouchableOpacity
                  onPress={() => setBannerDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
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
          {timeGreeting()}{caregiverFirstName ? `, ${caregiverFirstName}` : ''}.
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
                <Ionicons name={activity.icon} size={28} color={accent.icon} style={styles.tileIcon} />
                <Text style={[styles.tileLabel, { color: accent.icon }]}>{activity.label}</Text>
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
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  residentAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  residentAvatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.white,
  },
  residentName: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
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
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 10,
    lineHeight: 20,
  },
  bannerAction: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.primary,
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radii.lg,
    padding: 20,
    minHeight: 120,
    justifyContent: 'flex-end',
  },
  tileIcon: { marginBottom: 10 },
  tileLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
  },
});
