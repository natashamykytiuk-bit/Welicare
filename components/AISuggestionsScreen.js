import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { generateSuggestions } from '../utils/aiSuggestions';
import { hasAnyLifeStoryData } from '../utils/lifeStory';
import BackButton from './BackButton';

// Shared shell for the three AI-generated suggestion screens (Activity
// Ideas, Conversation Starters, Music & Movie Recs). Each just supplies a
// `kind` (matching the Cloud Function's expected values), a title, and a
// description; this component handles fetching the resident's life story
// (if any), calling generateSuggestions, and the loading/error/no-profile
// states.
export default function AISuggestionsScreen({ navigation, route, kind, title, description }) {
  const residentId = route?.params?.residentId;
  const homeDestination = route?.params?.fromResidentMode ? 'ModeSelection' : undefined;

  const [hasProfile, setHasProfile] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      let lifeStory = null;
      if (residentId) {
        const snapshot = await getDoc(doc(db, 'residents', residentId));
        lifeStory = snapshot.data()?.lifeStory ?? null;
      }
      if (cancelled) return;
      setHasProfile(hasAnyLifeStoryData(lifeStory));
      try {
        const text = await generateSuggestions(kind, lifeStory);
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
  }, [residentId, kind]);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          {/* Back always just returns to the previous screen (Activity
              Menu when reached from Resident Mode) — it used to be
              repurposed as a PIN-gated exit straight to Mode Selection
              whenever fromResidentMode was set, which is wrong; that exit
              is what the separate home icon below is for, matching the
              back+home split every other activity screen (PlaceholderScreen,
              ActivityMenuScreen) already uses. */}
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
          {homeDestination ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('PINEntry', { destination: homeDestination })}
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

        {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && suggestions ? <Text style={styles.suggestions}>{suggestions}</Text> : null}
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
