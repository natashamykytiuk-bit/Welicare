import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import ChipSelector from '../components/ChipSelector';
import { db } from '../firebaseConfig';
import { MUSIC_GENRE_OPTIONS } from './BuildProfileScreen';
import { colors, fonts, radii } from '../theme';
import { MUSIC_DECADE_OPTIONS, thumbnailForVideoId } from '../utils/musicLibrary';
import {
  distinctArtists,
  extractConsoleLink,
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
          residentId ? getDoc(doc(db, 'residents', residentId)).then((s) => s.data()) : Promise.resolve(null),
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
          const filtered = favourites.filter(
            (entry) =>
              (!filterDecade || entry.decade === filterDecade) &&
              (filterGenres.length === 0 || filterGenres.some((g) => genresOf(entry).includes(g)))
          );
          setSubset(filtered);
        } else {
          const results = await queryMusicLibrarySubset({ decade: filterDecade, genres: filterGenres, facilityId });
          if (cancelled) return;
          const selectedIds = residentData?.selectedMusicVideoIds;
          setSubset(
            Array.isArray(selectedIds) && selectedIds.length > 0
              ? results.filter((entry) => selectedIds.includes(entry.videoId))
              : results
          );
        }
      } catch (e) {
        console.error('[MusicSelection] failed to load music library:', e.code, e.message, e);
        if (!cancelled) {
          // A missing composite index throws failed-precondition with a
          // one-click console link baked into the message — surfaced
          // as-is (see extractConsoleLink) instead of a generic message.
          setError(
            e.code === 'failed-precondition' ? e.message : 'Something went wrong loading music. Please try again.'
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
  const videos = (filterArtist ? subset.filter((v) => (v.artist || v.channelTitle) === filterArtist) : subset).slice()
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));

  const consoleLink = extractConsoleLink(error);
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
    setFavouriteIds((prev) => (isFavourite ? prev.filter((id) => id !== videoId) : [...prev, videoId]));
    if (viewMode === 'Favourites' && isFavourite) {
      setSubset((prev) => prev.filter((v) => v.videoId !== videoId));
    }
    try {
      await updateDoc(doc(db, 'residents', residentId), {
        favouriteMusicVideoIds: isFavourite ? arrayRemove(videoId) : arrayUnion(videoId),
      });
    } catch (e) {
      console.error('[MusicSelection] failed to update favourite:', e.code, e.message, e);
      setFavouriteIds((prev) => (isFavourite ? [...prev, videoId] : prev.filter((id) => id !== videoId)));
      if (viewMode === 'Favourites' && isFavourite) {
        setSubset((prev) => [...prev, video]);
      }
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        <ChipSelector options={availableArtists} value={filterArtist} onChange={setFilterArtist} includeAll />
        <View style={styles.chipSpacer} />
        <Text style={styles.filterLabel}>Genre</Text>
        <ChipSelector options={MUSIC_GENRE_OPTIONS} value={filterGenres} onChange={setFilterGenres} multi />
        <View style={styles.chipSpacer} />
        <Text style={styles.filterLabel}>Decade</Text>
        <ChipSelector options={MUSIC_DECADE_OPTIONS} value={filterDecade} onChange={setFilterDecade} includeAll />

        {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            {consoleLink ? (
              <TouchableOpacity onPress={() => Linking.openURL(consoleLink)} accessibilityRole="link">
                <Text style={styles.errorLink}>{consoleLink}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {!loading && !error && showFavouritesEmptyState ? (
          <Text style={styles.note}>No favourites yet — tap the heart next to a song to add one here.</Text>
        ) : null}
        {!loading && !error && !showFavouritesEmptyState && videos.length === 0 ? (
          <Text style={styles.note}>No songs match these filters yet.</Text>
        ) : null}

        {!loading && !error
          ? videos.map((video, index) => (
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
                        favouriteIds.includes(video.videoId) ? 'Remove from favourites' : 'Add to favourites'
                      }
                      accessibilityState={{ selected: favouriteIds.includes(video.videoId) }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={favouriteIds.includes(video.videoId) ? 'heart' : 'heart-outline'}
                        size={22}
                        color={favouriteIds.includes(video.videoId) ? colors.destructive : colors.textMuted}
                      />
                    </TouchableOpacity>
                  ) : null}
                  <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
                </View>
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
  errorLink: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 6,
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
