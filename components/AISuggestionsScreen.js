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
import useActivitySession from '../hooks/useActivitySession';
import { colors, fonts, radii } from '../theme';
import { generateSuggestions } from '../utils/aiSuggestions';
import { saveSuggestionFeedback } from '../utils/suggestionFeedback';
import { appendTopicToAvoid } from '../utils/residentSafety';
import BackButton from './BackButton';

// Shared shell for the AI suggestion screens (Conversation Starters today;
// an Activities screen would reuse it with kind="activities"). Each just
// supplies a `kind` (matching the Cloud Function's expected values), a
// title, and a description; this component handles calling
// generateSuggestions (which loads the resident's life story and safety
// notes itself, on the server) and the loading/error/no-profile states.
//
// What comes back is a brief for staff, not a script: a few ideas, each with
// a title, why it may suit this resident, and lines staff can adapt, plus
// tips. Staff can rate each line good/bad (stored per prompt version for
// tuning the prompt and training the classifier) and mark a whole idea
// "Not for" this resident (added to their topics to avoid).
export default function AISuggestionsScreen({ navigation, route, kind, title, description }) {
  const residentId = route?.params?.residentId;
  // fromResidentMode is only ever set when ActivityMenuScreen navigates
  // here for Conversation Starters — Activity Ideas/Music & Movie Recs
  // (Caregiver Mode) never set it, so this doubles as "is this a Resident
  // Mode screen" and gates the lock-feature behavior below the same way
  // PlaceholderScreen's homeDestination does.
  const homeDestination = route?.params?.fromResidentMode ? 'ModeSelection' : undefined;
  // Time spent here counts toward a resident's engagement, but only when
  // opened as a Resident Mode activity — not from Caregiver Mode's quick
  // links, where a caregiver is just browsing prompts.
  useActivitySession({
    navigation,
    activityType: 'conversation',
    activityId: kind,
    residentId: residentId ?? null,
    enabled: Boolean(route?.params?.fromResidentMode),
  });
  const { locked, requestPin } = useResidentLock();

  function goHome() {
    // slide_from_left makes this read as a back transition rather than a
    // forward push — see App.js's dynamic animation option on the
    // ModeSelection screen, which every other exit-to-ModeSelection in the
    // app already uses.
    navigation.navigate(homeDestination, { animation: 'slide_from_left' });
  }

  const [hasProfile, setHasProfile] = useState(false);
  // The parsed brief ({ ideas, tips }), or null until it arrives.
  const [brief, setBrief] = useState(null);
  const [promptVersion, setPromptVersion] = useState('');
  // Good/bad ratings are for any facility staff (the roles firestore.rules
  // let write suggestionFeedback), including in Resident Mode, where a
  // staff member is the one holding the tablet.
  const [canRate, setCanRate] = useState(false);
  // The rater's facility and role (users/{uid}), which a rating is filed
  // under — the same doc firestore.rules checks it against.
  const [raterProfile, setRaterProfile] = useState(null);
  // Lines rated in this visit, keyed "idea-line" → 'good' | 'bad'.
  const [ratings, setRatings] = useState(() => ({}));
  const [rateError, setRateError] = useState('');
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
        // Only what this screen itself shows is read here (the resident's
        // name, and the signed-in person's role for the buttons). The life
        // story and safety notes are loaded by the Cloud Function, which
        // checks access itself — someone who can't see life stories (e.g. a
        // volunteer) just gets general suggestions.
        if (residentId) {
          const [snapshot, userSnap] = await Promise.all([
            getDoc(doc(db, 'residents', residentId)),
            getDoc(doc(db, 'users', auth.currentUser?.uid ?? '-')),
          ]);
          if (cancelled) return;
          setResidentName(snapshot.data()?.name ?? '');
          const role = userSnap.data()?.role;
          setCanFlag(
            !route?.params?.fromResidentMode && ['Caregiver', 'Administrator'].includes(role)
          );
          setCanRate(['Caregiver', 'Administrator', 'Volunteer'].includes(role));
          setRaterProfile(userSnap.data() ?? null);
        }
        if (cancelled) return;
        const result = await generateSuggestions(kind, residentId);
        if (!cancelled) {
          setHasProfile(result.hasProfile);
          setBrief(result.brief);
          setPromptVersion(result.promptVersion);
        }
      } catch (e) {
        // httpsCallable errors carry `.code` (e.g. "unauthenticated",
        // "internal") and `.details` — both hidden by the generic message
        // below, so log them for debugging.
        console.error('generateSuggestions error:', e.code, e.message, e.details, e);
        // A usage limit (functions/rateLimit.js) has its own message, written
        // for the person reading it; everything else stays generic.
        if (!cancelled) {
          setError(
            e.code === 'functions/resource-exhausted'
              ? e.message
              : 'Something went wrong generating suggestions. Please try again.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [residentId, kind, route?.params?.fromResidentMode]);

  // "Not for {name}": adds a short note naming this idea to the resident's
  // topics to avoid, so future suggestions steer clear of it, and hides it
  // here. Works on a whole idea (its title), since that's the theme to avoid.
  async function handleFlag(idea, index) {
    setFlagError('');
    try {
      await appendTopicToAvoid(
        residentId,
        `Not a good fit (from AI suggestions): ${summarize(idea.title)}`
      );
      setFlagged((prev) => new Set(prev).add(index));
    } catch (e) {
      console.error('[AISuggestions] failed to save flag:', e.code, e.message);
      setFlagError('Could not save that. Please try again.');
    }
  }

  // Good/bad on one line. Saved straight away and then locked in for this
  // visit; a failure is shown so the rater knows it didn't count. Ratings
  // are about the prompt, so only the line, kind and prompt version are
  // stored — see utils/suggestionFeedback.js.
  async function handleRate(line, key, rating) {
    if (ratings[key]) return;
    setRateError('');
    setRatings((prev) => ({ ...prev, [key]: rating }));
    try {
      await saveSuggestionFeedback({
        kind,
        promptVersion,
        itemText: line,
        rating,
        profile: raterProfile,
      });
    } catch (e) {
      console.error('[AISuggestions] failed to save rating:', e.code, e.message);
      setRatings((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setRateError('Could not save your rating. Please try again.');
    }
  }

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

        {/* Only once the brief is back: whether a profile was used is the
            function's answer (it decides what this person may see), so
            there's nothing to say while it's still loading. */}
        {!loading && !error && !hasProfile ? (
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
        {rateError ? <Text style={styles.error}>{rateError}</Text> : null}

        {!loading && !error && brief?.tips?.length ? (
          <View style={styles.tips}>
            <Text style={styles.tipsHeading}>Tips</Text>
            {brief.tips.map((tip, i) => (
              <Text key={i} style={styles.tipText}>
                {tip}
              </Text>
            ))}
          </View>
        ) : null}

        {!loading && !error && brief
          ? brief.ideas.map((idea, index) =>
              flagged.has(index) ? (
                <Text key={index} style={styles.flaggedNote}>
                  Noted — added to {residentName || 'this resident'}&apos;s topics to avoid.
                </Text>
              ) : (
                <View key={index} style={styles.item}>
                  <Text style={styles.ideaTitle}>{idea.title}</Text>
                  {idea.why ? <Text style={styles.ideaWhy}>{idea.why}</Text> : null}
                  {idea.try.map((line, lineIndex) => {
                    const key = `${index}-${lineIndex}`;
                    return (
                      <View key={key} style={styles.lineRow}>
                        <Text style={styles.lineText}>{line}</Text>
                        {canRate ? (
                          <RateButtons
                            rated={ratings[key]}
                            onRate={(rating) => handleRate(line, key, rating)}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                  {canFlag ? (
                    <TouchableOpacity
                      style={styles.flagButton}
                      onPress={() => handleFlag(idea, index)}
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

// Thumbs up / thumbs down for one line. Once a line is rated the other
// button is hidden and the chosen one stays filled, so it reads as done.
// Muted colours on purpose: this is a quiet staff tool, and in Resident
// Mode it sits on a screen the resident may also be looking at.
function RateButtons({ rated, onRate }) {
  return (
    <View style={styles.rateRow}>
      {rated !== 'bad' ? (
        <TouchableOpacity
          style={styles.rateButton}
          onPress={() => onRate('good')}
          disabled={Boolean(rated)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={rated ? 'Rated good' : 'Good suggestion'}
        >
          <Ionicons
            name={rated === 'good' ? 'thumbs-up' : 'thumbs-up-outline'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      ) : null}
      {rated !== 'good' ? (
        <TouchableOpacity
          style={styles.rateButton}
          onPress={() => onRate('bad')}
          disabled={Boolean(rated)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={rated ? 'Rated not good' : 'Not a good suggestion'}
        >
          <Ionicons
            name={rated === 'bad' ? 'thumbs-down' : 'thumbs-down-outline'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
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
  // The tips box reuses the "add a profile" note's mist background, so
  // guidance for staff looks the same wherever it appears.
  tips: {
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 20,
  },
  tipsHeading: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 4,
  },
  tipText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  ideaTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  ideaWhy: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 6,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  lineText: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  rateRow: { flexDirection: 'row', marginLeft: 8 },
  // 36pt square: big enough to tap reliably without crowding the text.
  rateButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
