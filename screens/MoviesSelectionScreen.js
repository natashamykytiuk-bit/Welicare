import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import ChipSelector from '../components/ChipSelector';
import LoadError from '../components/LoadError';
import { db } from '../firebaseConfig';
import useActivitySession from '../hooks/useActivitySession';
import { colors, fonts, radii } from '../theme';
import {
  MOVIE_DECADE_OPTIONS,
  MOVIE_GENRE_OPTIONS,
  filterMovies,
  filterToApprovedMovies,
  queryMovieLibrary,
  sortMovies,
} from '../utils/movieLibrary';
import { thumbnailForVideoId } from '../utils/musicLibrary';
import { getCurrentUserFacilityId } from '../utils/musicLibraryQuery';

const VIEW_MODE_OPTIONS = ['All Movies', 'Favourites'];

// Resident-facing Movies & Videos browser (reached from the Activity Menu).
// Shows ONLY the facility's curated movieLibrary — there's deliberately no
// search box here: open YouTube search lives in staff-only
// MovieLibraryScreen, so every video a resident can reach has been added by
// staff, and CurateResidentMoviesScreen can narrow it further per resident
// (filterToApprovedMovies — the same rule for both views, so an
// un-approved favourite can't slip through).
//
// Filters are genre and decade only (no actors or credits), and the list
// is sorted by decade then title. The whole library is loaded once and
// filtered on screen, since movie libraries are small.
export default function MoviesSelectionScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  // Browsing counts toward the resident's movies engagement too, logged under
  // the same activity as the player. Opening a video blurs this screen, so
  // browsing and playing are saved as separate visits, never overlapping.
  useActivitySession({ navigation, activityType: 'movies', activityId: 'movies', residentId });

  const [viewMode, setViewMode] = useState('All Movies');
  const [library, setLibrary] = useState([]);
  const [resident, setResident] = useState(null);
  const [favouriteIds, setFavouriteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [filterGenre, setFilterGenre] = useState('');
  const [filterDecade, setFilterDecade] = useState('');

  useEffect(() => {
    // Guards setState after the awaits if the resident backs out first.
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const [facilityId, residentData] = await Promise.all([
          getCurrentUserFacilityId(),
          residentId
            ? getDoc(doc(db, 'residents', residentId)).then((s) => s.data() ?? null)
            : Promise.resolve(null),
        ]);
        const entries = await queryMovieLibrary(facilityId);
        if (cancelled) return;
        setResident(residentData);
        setFavouriteIds(residentData?.favouriteMovieVideoIds ?? []);
        setLibrary(entries);
      } catch (e) {
        console.error('[MoviesSelection] failed to load movies:', e.code, e.message, e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [residentId, reloadKey]);

  // Approved for this resident → (Favourites only, if chosen) → genre and
  // decade → sorted.
  const approved = filterToApprovedMovies(library, resident);
  const inView =
    viewMode === 'Favourites' ? approved.filter((m) => favouriteIds.includes(m.videoId)) : approved;
  const movies = sortMovies(filterMovies(inView, { genre: filterGenre, decade: filterDecade }));
  const showFavouritesEmptyState = viewMode === 'Favourites' && favouriteIds.length === 0;

  // Hearts a movie straight from the list — same optimistic
  // update-then-revert-on-failure shape as MusicSelectionScreen, stored in
  // the resident's own favouriteMovieVideoIds (separate from music).
  async function handleToggleFavourite(movie) {
    if (!residentId) return;
    const { videoId } = movie;
    const wasFavourite = favouriteIds.includes(videoId);
    setFavouriteIds((prev) =>
      wasFavourite ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
    try {
      await updateDoc(doc(db, 'residents', residentId), {
        favouriteMovieVideoIds: wasFavourite ? arrayRemove(videoId) : arrayUnion(videoId),
      });
    } catch (e) {
      console.error('[MoviesSelection] failed to update favourite:', e.code, e.message, e);
      setFavouriteIds((prev) =>
        wasFavourite ? [...prev, videoId] : prev.filter((id) => id !== videoId)
      );
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      {/* One FlatList for the whole screen (header and filters included via
          ListHeaderComponent) rather than a ScrollView around every entry:
          FlatList only renders the rows near the screen, so a large library
          stays smooth on older tablets. */}
      <FlatList
        data={!loading && !loadError ? movies : []}
        keyExtractor={(entry) => entry.id}
        extraData={favouriteIds}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <>
            <BackButton navigation={navigation} />
            <Text style={styles.heading}>Movies &amp; Videos</Text>
            <Text style={styles.body}>Choose something to watch.</Text>

            {residentId ? (
              <>
                <ChipSelector options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
                <View style={styles.chipSpacer} />
              </>
            ) : null}

            <Text style={styles.filterLabel}>Genre</Text>
            <ChipSelector
              options={MOVIE_GENRE_OPTIONS}
              value={filterGenre}
              onChange={setFilterGenre}
              includeAll
            />
            <View style={styles.chipSpacer} />
            <Text style={styles.filterLabel}>Decade</Text>
            <ChipSelector
              options={MOVIE_DECADE_OPTIONS}
              value={filterDecade}
              onChange={setFilterDecade}
              includeAll
            />

            {loadError ? <LoadError onRetry={() => setReloadKey((k) => k + 1)} /> : null}
            {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}

            {!loading && !loadError && showFavouritesEmptyState ? (
              <Text style={styles.note}>
                No favourites yet — tap the heart next to a movie to add one here.
              </Text>
            ) : null}
            {!loading && !loadError && !showFavouritesEmptyState && movies.length === 0 ? (
              <Text style={styles.note}>
                {library.length === 0
                  ? 'No movies have been added yet. A caregiver can add some from Manage Music & Videos.'
                  : 'No movies match these filters.'}
              </Text>
            ) : null}
          </>
        }
        renderItem={({ item: movie }) => {
          const isFavourite = favouriteIds.includes(movie.videoId);
          return (
            <TouchableOpacity
              key={movie.id}
              style={styles.card}
              onPress={() =>
                navigation.navigate('MoviesPlayer', {
                  videoId: movie.videoId,
                  title: movie.title,
                  residentId,
                })
              }
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={movie.title}
            >
              <Image
                source={{ uri: movie.thumbnailUrl || thumbnailForVideoId(movie.videoId) }}
                style={styles.thumbnail}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {movie.title}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {[(movie.genres ?? []).join(', '), movie.decade].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.cardActions}>
                {residentId ? (
                  <TouchableOpacity
                    onPress={() => handleToggleFavourite(movie)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isFavourite ? 'Remove from favourites' : 'Add to favourites'
                    }
                    accessibilityState={{ selected: isFavourite }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={isFavourite ? 'heart' : 'heart-outline'}
                      size={22}
                      color={isFavourite ? colors.destructive : colors.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
                <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
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
  filterLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipSpacer: { height: 12 },
  spinner: { marginTop: 16 },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.secondary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginTop: 16,
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
    marginTop: 16,
  },
  thumbnail: {
    width: 80,
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
