import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import { useResidentLock } from '../contexts/ResidentLockContext';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { buildMovieQueries } from '../utils/movieQueries';
import { searchMovies } from '../utils/youtube';

// Browse screen shown before MoviesPlayerScreen. Mirrors
// MusicSelectionScreen exactly, swapping in buildMovieQueries/searchMovies:
// on mount this loads the resident's lifeStory and searches YouTube for the
// first query buildMovieQueries derives from it (favourite movies, then a
// safe fallback). Staff can also search anything manually via the field
// above the results.
export default function MoviesSelectionScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const { locked } = useResidentLock();

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function runSearch(query) {
    setLoading(true);
    setError('');
    try {
      const found = await searchMovies(query);
      setResults(found);
    } catch (e) {
      // httpsCallable errors carry `.code` (e.g. "unauthenticated",
      // "internal") and `.details` — both hidden by the generic message
      // below, so log them for debugging.
      console.error('searchYouTube error:', e.code, e.message, e.details, e);
      setError('Something went wrong searching for movies. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

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
      const [firstQuery] = buildMovieQueries(lifeStory);
      try {
        const found = await searchMovies(firstQuery);
        if (!cancelled) setResults(found);
      } catch (e) {
        console.error('searchYouTube error:', e.code, e.message, e.details, e);
        if (!cancelled) {
          setError('Something went wrong searching for movies. Please try again.');
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSearched(true);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [residentId]);

  function handleManualSearch() {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    runSearch(trimmed);
  }

  const showEmptyState = !loading && !error && searched && results.length === 0;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!locked ? <BackButton navigation={navigation} /> : null}
        <Text style={styles.heading}>Movies & Videos</Text>
        <Text style={styles.body}>Choose something to watch.</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search for any movie or show"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleManualSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleManualSearch}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {showEmptyState ? <Text style={styles.note}>No results found — try a different search.</Text> : null}

        {!loading && !error
          ? results.map((video) => (
              <TouchableOpacity
                key={video.videoId}
                style={styles.card}
                onPress={() =>
                  navigation.navigate('MoviesPlayer', {
                    videoId: video.videoId,
                    title: video.title,
                    residentId,
                  })
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={video.title}
              >
                {video.thumbnailUrl ? (
                  <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.artPlaceholder}>
                    <Ionicons name="film-outline" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {video.title}
                  </Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    {video.channelTitle}
                  </Text>
                </View>
                <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
              </TouchableOpacity>
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { marginBottom: 16 },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  artPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
  },
});
