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
import { db } from '../firebaseConfig';
import { MUSIC_GENRE_OPTIONS } from './BuildProfileScreen';
import { colors, fonts, radii } from '../theme';
import {
  MUSIC_DECADE_OPTIONS,
  thumbnailForVideoId,
  filterToApprovedMusic,
} from '../utils/musicLibrary';
import {
  distinctArtists,
  genresOf,
  getCurrentUserFacilityId,
  queryMusicLibraryByVideoIds,
  queryMusicLibrarySubset,
} from '../utils/musicLibraryQuery';

const VIEW_MODE_OPTIONS = ['All Music', 'Favourites'];

// Browse screen shown before MusicPlayerScreen. Reads from the curated
// musicLibrary collection (see ManageMusicScreen/MusicLibraryScreen/
// CurateResidentMusicScreen) rather than live YouTube search, so every
// video a resident sees has been vetted by a caregiver ahead of time.
//
// Two view modes (only offered when there's a resident to scope them to):
// "All Music" is the resident's selectedMusicVideoIds curation if set,
// else the full library, same as before. "Favourites" is whatever the
// resident has hearted from MusicPlayerScreen. Genre/decade still apply
// within Favourites — see the effect below for how that's layered on top
// of the videoId-based favourites fetch instead of Firestore where()s, to
// avoid needing a composite index for every {favourite, decade, genres}
// combination.
//
// Decade and genres are applied server-side for "All Music" (see
// queryMusicLibrarySubset); artist is always applied client-side on top of
// whichever result set is active, so the artist dropdown's options can be
// derived from "whatever's already narrowed down" without extra indexes.
export default function MusicSelectionScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;

  const [viewMode, setViewMode] = useState('All Music');
  const [subset, setSubset] = useState([]);
  const [favouriteIds, setFavouriteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterArtist, setFilterArtist] = useState('');
  const [filterGenres, setFilterGenres] = useState([]);
  const [filterDecade, setFilterDecade] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      try {
        const [facilityId, residentData] = await Promise.all([
          getCurrentUserFacilityId(),
          residentId
            ? getDoc(doc(db, 'residents', residentId)).then((s) => s.data())
            : Promise.resolve(null),
        ]);

        const ids = residentData?.favouriteMusicVideoIds ?? [];
        if (cancelled) return;
        setFavouriteIds(ids);

        if (viewMode === 'Favourites') {
          const favourites = await queryMusicLibraryByVideoIds(ids, facilityId);
          if (cancelled) return;
          // Genre/decade are applied client-side here (favourites lists
          // are small) rather than folded into the videoId 'in' query,
          // which can't combine with decade/genres filters without its
          // own composite index per combination.
          // Favourites are limited to songs that are still approved for
          // this resident (filterToApprovedMusic) — a song removed from
          // their approved list doesn't stay playable just because it was
          // hearted earlier.
          const filtered = filterToApprovedMusic(favourites, residentData).filter(
            (entry) =>
              (!filterDecade || entry.decade === filterDecade) &&
              (filterGenres.length === 0 || filterGenres.some((g) => genresOf(entry).includes(g)))
          );
          setSubset(filtered);
        } else {
          const results = await queryMusicLibrarySubset({
            decade: filterDecade,
            genres: filterGenres,
            facilityId,
          });
          if (cancelled) return;
          // Same approval rule as Favourites. An empty approved list now
          // means "nothing approved", not "everything".
          setSubset(filterToApprovedMusic(results, residentData));
        }
      } catch (e) {
        console.error('[MusicSelection] failed to load music library:', e.code, e.message, e);
        if (!cancelled) {
          // Residents see a plain message, never Firebase details. A missing
          // index (failed-precondition) is a setup problem for us to fix —
          // the console.error above records its details and console link.
          setError(
            e.code === 'failed-precondition'
              ? 'This music choice isn’t available right now. Try a different filter, or ask a staff member.'
              : 'Something went wrong loading music. Please try again.'
          );
          setSubset([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [residentId, filterDecade, filterGenres, viewMode]);

  const availableArtists = distinctArtists(subset);
  const videos = (
    filterArtist ? subset.filter((v) => (v.artist || v.channelTitle) === filterArtist) : subset
  )
    .slice()
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));

  const showFavouritesEmptyState = viewMode === 'Favourites' && favouriteIds.length === 0;

  // Lets a song be hearted straight from this list, without opening the
  // player — mirrors MusicPlayerScreen's own toggle (same field, same
  // optimistic-update-then-revert-on-failure shape). Only offered when
  // there's a resident to store the favourite against, same restriction
  // as the player's heart button.
  async function handleToggleFavourite(video) {
    if (!residentId) return;
    const videoId = video.videoId;
    const isFavourite = favouriteIds.includes(videoId);
    setFavouriteIds((prev) =>
      isFavourite ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
    if (viewMode === 'Favourites' && isFavourite) {
      setSubset((prev) => prev.filter((v) => v.videoId !== videoId));
    }
    try {
      await updateDoc(doc(db, 'residents', residentId), {
        favouriteMusicVideoIds: isFavourite ? arrayRemove(videoId) : arrayUnion(videoId),
      });
    } catch (e) {
      console.error('[MusicSelection] failed to update favourite:', e.code, e.message, e);
      setFavouriteIds((prev) =>
        isFavourite ? [...prev, videoId] : prev.filter((id) => id !== videoId)
      );
      if (viewMode === 'Favourites' && isFavourite) {
        setSubset((prev) => [...prev, video]);
      }
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      {/* One FlatList for the whole screen (header and filters included via
          ListHeaderComponent) rather than a ScrollView around every song:
          FlatList only renders the rows near the screen, so a large library
          stays smooth on older tablets. */}
      <FlatList
        data={!loading && !error ? videos : []}
        keyExtractor={(video) => video.id}
        extraData={favouriteIds}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <>
            <BackButton navigation={navigation} />
            <Text style={styles.heading}>Music</Text>
            <Text style={styles.body}>Choose a song to play.</Text>

            {residentId ? (
              <>
                <ChipSelector options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
                <View style={styles.chipSpacer} />
              </>
            ) : null}

            <Text style={styles.filterLabel}>Artist</Text>
            <ChipSelector
              options={availableArtists}
              value={filterArtist}
              onChange={setFilterArtist}
              includeAll
            />
            <View style={styles.chipSpacer} />
            <Text style={styles.filterLabel}>Genre</Text>
            <ChipSelector
              options={MUSIC_GENRE_OPTIONS}
              value={filterGenres}
              onChange={setFilterGenres}
              multi
            />
            <View style={styles.chipSpacer} />
            <Text style={styles.filterLabel}>Decade</Text>
            <ChipSelector
              options={MUSIC_DECADE_OPTIONS}
              value={filterDecade}
              onChange={setFilterDecade}
              includeAll
            />

            {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            {!loading && !error && showFavouritesEmptyState ? (
              <Text style={styles.note}>
                No favourites yet — tap the heart next to a song to add one here.
              </Text>
            ) : null}
            {!loading && !error && !showFavouritesEmptyState && videos.length === 0 ? (
              <Text style={styles.note}>No songs match these filters yet.</Text>
            ) : null}
          </>
        }
        renderItem={({ item: video, index }) => (
          <TouchableOpacity
            key={video.id}
            style={styles.card}
            // Hands the player the whole visible list (in its current
            // filter/view order) plus where to start, so it can play the
            // songs after the tapped one as an "Up next" queue. Only
            // the fields the player needs are passed — navigation params
            // should stay small and serialisable. genres/decade/artist
            // feed the player's similarity ranking (see songSimilarity);
            // genresOf/channelTitle cover pre-migration docs.
            onPress={() =>
              navigation.navigate('MusicPlayer', {
                queue: videos
                  .filter((v) => v.videoId)
                  .map((v) => ({
                    videoId: v.videoId,
                    title: v.title,
                    genres: genresOf(v),
                    decade: v.decade ?? null,
                    artist: v.artist || v.channelTitle || null,
                  })),
                startIndex: videos.filter((v, i) => v.videoId && i < index).length,
                videoId: video.videoId,
                title: video.title,
                residentId,
              })
            }
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={video.title}
          >
            <Image
              source={{ uri: video.thumbnailUrl || thumbnailForVideoId(video.videoId) }}
              style={styles.thumbnail}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {video.title}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {video.artist || video.channelTitle}
              </Text>
            </View>
            <View style={styles.cardActions}>
              {residentId ? (
                <TouchableOpacity
                  onPress={() => handleToggleFavourite(video)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    favouriteIds.includes(video.videoId)
                      ? 'Remove from favourites'
                      : 'Add to favourites'
                  }
                  accessibilityState={{ selected: favouriteIds.includes(video.videoId) }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={favouriteIds.includes(video.videoId) ? 'heart' : 'heart-outline'}
                    size={22}
                    color={
                      favouriteIds.includes(video.videoId) ? colors.destructive : colors.textMuted
                    }
                  />
                </TouchableOpacity>
              ) : null}
              <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
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
  errorBox: { marginTop: 16 },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
  },
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
