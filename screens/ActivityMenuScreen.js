import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { db } from '../firebaseConfig';
import { colors as theme, fonts as themeFonts, radii as themeRadii } from '../theme';
import { hasAnyLifeStoryData } from '../utils/lifeStory';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// Conversation Starters passes fromResidentMode so that screen knows to
// show the PIN-gated home icon instead of its normal back-only header.
const ACTIVITIES = [
  { label: 'Guided Meditation & Exercise', screen: 'GuidedMeditation' },
  { label: 'Music Player', screen: 'MusicPlayer' },
  { label: 'Games', screen: 'Games' },
  { label: 'Trivia', screen: 'Trivia' },
  { label: 'Photo Album', screen: 'PhotoAlbum' },
  { label: 'Conversation Starters', screen: 'ConversationStarters', params: { fromResidentMode: true } },
];

// The main hub once a resident (or Guest Mode) has been picked in
// ResidentModeScreen. Three header icons: back (to ResidentModeScreen),
// settings gear (to ResidentProfile, for editing this resident's info —
// not the global SettingsScreen), and home (PIN-gated exit to
// ModeSelection, same as ResidentModeScreen).
export default function ActivityMenuScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const residentName = route?.params?.residentName ?? 'this resident';
  const [resident, setResident] = useState(null);
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

  const preferredName =
    resident?.lifeStory?.preferredName || resident?.name?.split(' ')[0] || residentName;
  const showBanner = !!residentId && !bannerDismissed && !hasAnyLifeStoryData(resident?.lifeStory);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <BackButton navigation={navigation} style={styles.iconNoMargin} />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('ResidentProfile')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit resident info"
            >
              <Ionicons name="settings-outline" size={20} color={PRIMARY_DARK} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('PINEntry', { destination: 'ModeSelection' })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Return to Mode Selection"
          >
            <Ionicons name="home-outline" size={20} color={PRIMARY_DARK} />
          </TouchableOpacity>
        </View>

        {showBanner ? (
          <View style={styles.banner}>
            <View style={styles.bannerAccent} />
            <View style={styles.bannerBody}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons name="sparkles" size={18} color={theme.primary} style={styles.bannerIcon} />
                <Text style={styles.bannerTitle}>Personalize {preferredName}'s experience</Text>
                <TouchableOpacity
                  onPress={() => setBannerDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={theme.textMuted} />
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

        <Text style={styles.heading}>Activity Menu</Text>
        <Text style={styles.body}>Choose an activity for {residentName}.</Text>

        {ACTIVITIES.map((activity) => (
          <TouchableOpacity
            key={activity.screen}
            style={styles.card}
            onPress={() => navigation.navigate(activity.screen, { ...activity.params, residentId })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={activity.label}
          >
            <Text style={styles.cardTitle}>{activity.label}</Text>
          </TouchableOpacity>
        ))}
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
  banner: {
    flexDirection: 'row',
    backgroundColor: theme.mistBackground,
    borderRadius: themeRadii.lg,
    overflow: 'hidden',
    marginBottom: 20,
  },
  bannerAccent: { width: 3, backgroundColor: theme.primary },
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
    fontFamily: themeFonts.sansBold,
    fontSize: 16,
    color: theme.textPrimary,
  },
  bannerSubtext: {
    fontFamily: themeFonts.sansRegular,
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: 10,
    lineHeight: 20,
  },
  bannerAction: {
    fontFamily: themeFonts.sansBold,
    fontSize: 15,
    color: theme.primary,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: BOLD,
    fontSize: 17,
    color: PRIMARY_DARK,
  },
});
