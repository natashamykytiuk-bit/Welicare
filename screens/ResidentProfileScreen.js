import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import FamilyAccessCard from '../components/FamilyAccessCard';
import ResidentPhotoEditor from '../components/ResidentPhotoEditor';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  PERIODS,
  formatDuration,
  loadResidentSessions,
  summarizeSessions,
} from '../utils/engagementStats';
import { loadLifeStory, residentHasLifeStory } from '../utils/residentLifeStory';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

// The life-story answers shown on the profile, in this order. A short
// selection of the most useful ones for planning activities; the full
// questionnaire is one tap away (Edit life story → BuildProfileScreen).
const LIFE_STORY_FIELDS = [
  { key: 'preferredName', label: 'Preferred name' },
  { key: 'age', label: 'Age' },
  { key: 'grewUpIn', label: 'Grew up in' },
  { key: 'career', label: 'Work' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'musicGenres', label: 'Music they enjoy' },
  { key: 'favouriteMusicians', label: 'Favourite musicians' },
  { key: 'importantPeople', label: 'Important people' },
  { key: 'specialPlace', label: 'A special place' },
];

// Caregiver Mode → My Residents → a resident. One place to see a resident's
// profile and how they've been engaging:
//   - Profile: name, key life-story answers (read-only), and buttons to
//     edit the life story (BuildProfileScreen, which returns here) and the
//     safety notes (ResidentSafetyScreen).
//   - Engagement: time spent per activity over the last 7 days, 30 days or
//     all time, from the activitySessions log (utils/engagementStats.js).
//
// Everything reloads on focus, so an edit made in BuildProfile shows as
// soon as the caregiver comes back.
//
// Also reachable without a resident (Caregiver Mode's "Resident Profile"
// quick link, ActivityMenuScreen's settings gear): then it points the
// caregiver to My Residents to pick one, rather than guessing.
// Who may add photos to a resident's album, and who may remove anyone's
// (mirrors the photos rules in firestore.rules / storage.rules).
const PHOTO_UPLOAD_ROLES = ['Family Caregiver', 'Caregiver', 'Administrator'];
const PHOTO_MODERATOR_ROLES = ['Caregiver', 'Administrator'];

export default function ResidentProfileScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const [resident, setResident] = useState(null);
  const [lifeStory, setLifeStory] = useState(null);
  const [lifeStoryDenied, setLifeStoryDenied] = useState(false);
  const [sessions, setSessions] = useState([]);
  // False when the caregiver has no organization: sessions are filed per
  // organization, so there's nothing they're allowed to read.
  const [hasOrg, setHasOrg] = useState(true);
  // The viewer's role — decides which photo album options to offer.
  const [role, setRole] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(!!residentId);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !residentId) return;
    setError('');
    try {
      const [userSnap, residentSnap] = await withTimeout(
        Promise.all([getDoc(doc(db, 'users', uid)), getDoc(doc(db, 'residents', residentId))]),
        LOAD_TIMEOUT_MS,
        'Loading this resident is taking longer than expected. Please check your connection and try again.'
      );
      if (!residentSnap.exists()) {
        setError('This resident could not be found. They may have been removed.');
        return;
      }
      const residentData = residentSnap.data();
      setResident(residentData);
      const orgId = userSnap.data()?.orgId;
      setHasOrg(!!orgId);
      setRole(userSnap.data()?.role ?? null);

      // The life story and the engagement log load side by side, and each
      // fails on its own: a problem with one mustn't hide the other.
      const [story, logged] = await Promise.allSettled([
        loadLifeStory(residentId, residentData),
        orgId ? loadResidentSessions(orgId, residentId) : Promise.resolve([]),
      ]);
      if (story.status === 'fulfilled') {
        setLifeStory(story.value.lifeStory);
        setLifeStoryDenied(story.value.denied);
      } else {
        console.error('[ResidentProfile] failed to load life story:', story.reason);
      }
      if (logged.status === 'fulfilled') {
        setSessions(logged.value);
        setStatsError('');
      } else {
        console.error('[ResidentProfile] failed to load sessions:', logged.reason);
        setStatsError('Could not load activity time. Please try again later.');
      }
    } catch (e) {
      console.error('[ResidentProfile] failed to load resident:', e.code, e.message, e);
      setError(e.code ? 'Could not load this resident. Please try again.' : e.message);
    } finally {
      setLoading(false);
    }
  }, [residentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!residentId) {
    return (
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <BackButton navigation={navigation} />
          <Text style={styles.heading}>Resident Profile</Text>
          <Text style={styles.body}>Choose a resident to see their profile and activity.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('CaregiverResidents')}
            accessibilityRole="button"
            accessibilityLabel="Go to My Residents"
          >
            <Text style={styles.primaryButtonText}>Go to My Residents</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const selected = PERIODS.find((p) => p.key === period) ?? PERIODS[1];
  const summary = summarizeSessions(sessions, { days: selected.days });
  const longest = summary.activities[0]?.seconds ?? 0;
  const answers = LIFE_STORY_FIELDS.map((f) => ({
    ...f,
    value: answerText(lifeStory?.[f.key]),
  })).filter((f) => f.value);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          <>
            <ResidentPhotoEditor residentId={residentId} resident={resident} size={88} />
            <Text style={styles.heading}>{resident?.name || 'Unnamed resident'}</Text>
            {resident?.preferredName && resident.preferredName !== resident.name ? (
              <Text style={styles.body}>Likes to be called {resident.preferredName}</Text>
            ) : null}

            {/* --- Profile --- */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Profile</Text>
              {lifeStoryDenied ? (
                <Text style={styles.muted}>
                  Your organization hasn't allowed volunteers to view life stories.
                </Text>
              ) : answers.length > 0 ? (
                answers.map((a) => (
                  <View key={a.key} style={styles.answerRow}>
                    <Text style={styles.answerLabel}>{a.label}</Text>
                    <Text style={styles.answerValue}>{a.value}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>
                  {residentHasLifeStory(resident)
                    ? 'No key details filled in yet.'
                    : 'Life story not started yet.'}
                </Text>
              )}
              <View style={styles.buttonRow}>
                {!lifeStoryDenied ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      navigation.navigate('BuildProfile', {
                        residentId,
                        returnTo: 'ResidentProfile',
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Edit life story"
                  >
                    <Ionicons name="create-outline" size={20} color={colors.white} />
                    <Text style={styles.primaryButtonText}>Edit life story</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('ResidentSafety', { residentId })}
                  accessibilityRole="button"
                  accessibilityLabel="Safety notes"
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Safety notes</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* --- Photo album ---
                Uploads happen here, outside Resident Mode; the album itself
                is only shown to the resident (ResidentPhotoAlbumScreen).
                Volunteers can't upload (see firestore.rules), so they get
                no buttons; only Caregivers and Administrators moderate. */}
            {PHOTO_UPLOAD_ROLES.includes(role) ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Photo album</Text>
                <Text style={styles.muted}>
                  Photos shared here appear in the Photo Album in Resident Mode.
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      navigation.navigate('ResidentPhotoUpload', {
                        residentId,
                        residentName: resident?.name,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Add photos"
                  >
                    <Ionicons name="images-outline" size={20} color={colors.white} />
                    <Text style={styles.primaryButtonText}>Add photos</Text>
                  </TouchableOpacity>
                  {PHOTO_MODERATOR_ROLES.includes(role) ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() =>
                        navigation.navigate('ResidentPhotoManage', {
                          residentId,
                          residentName: resident?.name,
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Manage photos"
                    >
                      <Ionicons name="albums-outline" size={20} color={colors.primary} />
                      <Text style={styles.secondaryButtonText}>Manage photos</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* --- Family access ---
                Family codes are for facility residents only, and made by the
                facility's Caregivers/Administrators (see createFamilyCode). */}
            {PHOTO_MODERATOR_ROLES.includes(role) && resident?.facilityId ? (
              <FamilyAccessCard residentId={residentId} />
            ) : null}

            {/* --- Engagement --- */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Engagement</Text>
              {!hasOrg ? (
                <Text style={styles.muted}>
                  Activity time is recorded for organizations. Join or create one to see it here.
                </Text>
              ) : (
                <>
                  <View style={styles.periodRow} accessibilityRole="radiogroup">
                    {PERIODS.map((p) => {
                      const on = p.key === period;
                      return (
                        <TouchableOpacity
                          key={p.key}
                          style={[styles.periodChip, on && styles.periodChipOn]}
                          onPress={() => setPeriod(p.key)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={p.label}
                        >
                          <Text style={[styles.periodText, on && styles.periodTextOn]}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {statsError ? (
                    <Text style={styles.errorBanner} accessibilityRole="alert">
                      {statsError}
                    </Text>
                  ) : (
                    <>
                      <Text
                        style={styles.total}
                        accessibilityLabel={`Total ${formatDuration(summary.totalSeconds)}`}
                      >
                        {formatDuration(summary.totalSeconds)}
                      </Text>
                      <Text style={styles.muted}>Total time in activities</Text>

                      {summary.activities.length === 0 ? (
                        <Text style={[styles.muted, styles.spaced]}>
                          No activity recorded in this period.
                        </Text>
                      ) : (
                        summary.activities.map((a) => (
                          <View
                            key={a.activityId}
                            style={styles.activityRow}
                            accessible
                            accessibilityLabel={`${a.label}: ${formatDuration(a.seconds)} over ${a.sessions} ${a.sessions === 1 ? 'visit' : 'visits'}`}
                          >
                            <View style={styles.activityHeader}>
                              <Text style={styles.activityName}>{a.label}</Text>
                              <Text style={styles.activityTime}>{formatDuration(a.seconds)}</Text>
                            </View>
                            {/* Bar relative to the most-played activity, so
                                the split is readable at a glance. */}
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    width: `${longest ? Math.max(4, (a.seconds / longest) * 100) : 0}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.activityMeta}>
                              {a.sessions} {a.sessions === 1 ? 'visit' : 'visits'} · last played{' '}
                              {a.lastPlayedAt.toLocaleDateString()}
                            </Text>
                          </View>
                        ))
                      )}
                      {/* Only some activities log time so far (the games);
                          say so, so a low total isn't misread. */}
                      <Text style={[styles.note, styles.spaced]}>
                        Currently recorded for games (Memory Match, Molehunt, Finish the Phrase).
                        Guest Mode visits aren't counted for any resident.
                      </Text>
                    </>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// A life-story answer as display text: lists joined, blanks skipped.
function answerText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'string') return value.trim();
  return '';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  loading: { marginTop: 40 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  muted: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 21,
  },
  spaced: { marginTop: 12 },
  note: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  answerRow: { marginBottom: 10 },
  answerLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.textMuted,
  },
  answerValue: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  primaryButtonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.white },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 8,
  },
  secondaryButtonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.primary },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  periodChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.circular,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  periodChipOn: { backgroundColor: colors.mistBackground, borderColor: colors.primary },
  periodText: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.textPrimary },
  periodTextOn: { fontFamily: fonts.sansBold },
  total: {
    fontFamily: fonts.serifBold,
    fontSize: 34,
    color: colors.primary,
  },
  activityRow: { marginTop: 16 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  activityName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  activityTime: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  barTrack: {
    height: 10,
    borderRadius: radii.circular,
    backgroundColor: colors.mistBackground,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radii.circular, backgroundColor: colors.primary },
  activityMeta: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 15,
    padding: 14,
    marginTop: 16,
    lineHeight: 21,
  },
});
