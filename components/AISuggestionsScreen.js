import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useResidentLock } from '../contexts/ResidentLockContext';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { generateSuggestions } from '../utils/aiSuggestions';
import { hasAnyLifeStoryData } from '../utils/lifeStory';
import { loadLifeStory } from '../utils/residentLifeStory';
import { appendTopicToAvoid, loadTopicsToAvoid } from '../utils/residentSafety';
import BackButton from './BackButton';

// Shared shell for the three AI-generated suggestion screens (Activity
// Ideas, Conversation Starters, Music & Movie Recs). Each just supplies a
// `kind` (matching the Cloud Function's expected values), a title, and a
// description; this component handles fetching the resident's life story
// (if any), calling generateSuggestions, and the loading/error/no-profile
// states.
export default function AISuggestionsScreen({ navigation, route, kind, title, description }) {
  const residentId = route?.params?.residentId;
  // fromResidentMode is only ever set when ActivityMenuScreen navigates
  // here for Conversation Starters — Activity Ideas/Music & Movie Recs
  // (Caregiver Mode) never set it, so this doubles as "is this a Resident
  // Mode screen" and gates the lock-feature behavior below the same way
  // PlaceholderScreen's homeDestination does.
  const homeDestination = route?.params?.fromResidentMode ? 'ModeSelection' : undefined;
  const { locked, requestPin } = useResidentLock();

  function goHome() {
    // slide_from_left makes this read as a back transition rather than a
    // forward push — see App.js's dynamic animation option on the
    // ModeSelection screen, which every other exit-to-ModeSelection in the
    // app already uses.
    navigation.navigate(homeDestination, { animation: 'slide_from_left' });
  }

  const [hasProfile, setHasProfile] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [residentName, setResidentName] = useState('');
  // "Not for this resident" is staff-only: never in Resident Mode, and only
  // for the roles firestore.rules let write safety notes.
  const [canFlag, setCanFlag] = useState(false);
  // Suggestions flagged in this visit — hidden, and shown as "Noted".
  const [flagged, setFlagged] = useState(() => new Set());
  const [flagError, setFlagError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      // The resident read is inside the same try as the Cloud Function
      // call, so a Firestore failure also lands in catch/finally and the
      // spinner can't get stuck.
      try {
        // Someone who can't see life stories (e.g. a volunteer) just gets
        // general suggestions — loadLifeStory reports that as denied, not
        // as an error.
        let lifeStory = null;
        let topicsToAvoid = '';
        if (residentId) {
          const [snapshot, userSnap] = await Promise.all([
            getDoc(doc(db, 'residents', residentId)),
            getDoc(doc(db, 'users', auth.currentUser?.uid ?? '-')),
          ]);
          ({ lifeStory } = await loadLifeStory(residentId, snapshot.data()));
          // Safety notes are readable by everyone linked to the resident.
          // If they can't be loaded, this fails like any other load error
          // rather than generating suggestions that might ignore them.
          topicsToAvoid = await loadTopicsToAvoid(residentId);
          if (cancelled) return;
          setResidentName(snapshot.data()?.name ?? '');
          setCanFlag(
            !route?.params?.fromResidentMode &&
              ['Caregiver', 'Administrator'].includes(userSnap.data()?.role)
          );
        }
        if (cancelled) return;
        setHasProfile(hasAnyLifeStoryData(lifeStory));
        const text = await generateSuggestions(kind, lifeStory, topicsToAvoid);
        if (!cancelled) setSuggestions(text);
      } catch (e) {
        // httpsCallable errors carry `.code` (e.g. "unauthenticated",
        // "internal") and `.details` — both hidden by the generic message
        // below, so log them for debugging.
        console.error('generateSuggestions error:', e.code, e.message, e.details, e);
        if (!cancelled) setError('Something went wrong generating suggestions. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [residentId, kind, route?.params?.fromResidentMode]);

  // "Not for {name}": adds a short note about this suggestion to the
  // resident's topics to avoid, so future suggestions steer clear of it,
  // and hides it here.
  async function handleFlag(item, index) {
    setFlagError('');
    try {
      await appendTopicToAvoid(
        residentId,
        `Not a good fit (from AI suggestions): ${summarize(item)}`
      );
      setFlagged((prev) => new Set(prev).add(index));
    } catch (e) {
      console.error('[AISuggestions] failed to save flag:', e.code, e.message);
      setFlagError('Could not save that. Please try again.');
    }
  }

  const items = splitSuggestions(suggestions);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          {/* Back always just returns to the previous screen (Activity
              Menu when reached from Resident Mode) — unaffected by the
              Resident Mode lock, which only blocks paths that leave
              Resident Mode entirely. The separate home icon below is the
              actual exit-to-Mode-Selection affordance, and is what the
              lock gates. */}
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
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
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.body}>{description}</Text>

        {!hasProfile ? (
          <Text style={styles.note}>Add a profile to get personalized suggestions.</Text>
        ) : null}

        {/* testID is only for tests (tests/AISuggestionsScreen.test.js
            checks the spinner goes away); it has no visible effect. */}
        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.spinner}
            testID="ai-suggestions-loading"
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {flagError ? <Text style={styles.error}>{flagError}</Text> : null}
        {!loading && !error
          ? items.map((item, index) =>
              flagged.has(index) ? (
                <Text key={index} style={styles.flaggedNote}>
                  Noted — added to {residentName || 'this resident'}&apos;s topics to avoid.
                </Text>
              ) : (
                <View key={index} style={styles.item}>
                  <Text style={styles.suggestions}>{item}</Text>
                  {canFlag ? (
                    <TouchableOpacity
                      style={styles.flagButton}
                      onPress={() => handleFlag(item, index)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Not for ${residentName || 'this resident'}`}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                      <Text style={styles.flagButtonText}>
                        Not for {residentName || 'this resident'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            )
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Splits the model's reply into separate suggestions so each can get its own
// "Not for …" button: by blank lines when the reply has paragraphs, or by
// line otherwise. Exported for tests.
export function splitSuggestions(text) {
  if (!text?.trim()) return [];
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// A short, plain version of one suggestion for the topics-to-avoid note:
// its first line without list numbers or markdown, at most 150 characters.
export function summarize(item) {
  const first = item.split('\n')[0];
  return first
    .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
    .replace(/[*_#`]/g, '')
    .trim()
    .slice(0, 150);
}

const styles = StyleSheet.create({
  item: {
    marginBottom: 16,
  },
  flagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  flagButtonText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 4,
  },
  flaggedNote: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textMuted,
    marginBottom: 16,
  },
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    marginBottom: 16,
  },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.secondary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
  spinner: { marginTop: 16 },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
  },
  suggestions: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
  },
});
