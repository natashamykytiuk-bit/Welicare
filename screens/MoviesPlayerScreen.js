import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import YouTubeEmbed from '../components/YouTubeEmbed';
import { db } from '../firebaseConfig';
import useActivitySession from '../hooks/useActivitySession';
import { colors, fonts, radii } from '../theme';

// Real YouTube-backed playback via components/YouTubeEmbed (which has a
// separate web version, since react-native-youtube-iframe doesn't work
// properly in a browser) — the Movies & Videos equivalent of
// MusicPlayerScreen, see there for where videoId/title come from. Playback
// itself (play/pause/seek/progress) is entirely YouTube's own embedded
// controls.
//
// Only ever opened from MoviesSelectionScreen with a movie from the curated
// movieLibrary. The heart saves to the resident's favouriteMovieVideoIds
// (separate from their music favourites).
export default function MoviesPlayerScreen({ navigation, route }) {
  const videoId = route?.params?.videoId;
  const title = route?.params?.title ?? 'Untitled';
  const residentId = route?.params?.residentId;
  // Logs time spent watching to activitySessions, same as the games and
  // Music, so it shows under the resident's engagement on Resident
  // Profile. The movie is one "round", completed if it plays to the end.
  const session = useActivitySession({
    navigation,
    activityType: 'movies',
    activityId: 'movies',
    residentId,
  });
  const { roundStarted } = session;
  useEffect(() => {
    if (videoId) roundStarted(null);
  }, [videoId, roundStarted]);
  // Only shown when there's a resident to save a favourite for (not Guest
  // Mode).
  const [isFavourite, setIsFavourite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadFavourite() {
      if (!residentId || !videoId) return;
      // The heart is a nicety — if this fails the movie still plays and the
      // heart just shows as not favourited.
      try {
        const ids = (await getDoc(doc(db, 'residents', residentId))).data()?.favouriteMovieVideoIds;
        if (!cancelled) setIsFavourite(Array.isArray(ids) && ids.includes(videoId));
      } catch (e) {
        console.error('[MoviesPlayer] failed to load favourite status:', e.code, e.message, e);
      }
    }
    loadFavourite();
    return () => {
      cancelled = true;
    };
  }, [residentId, videoId]);

  // Optimistic: flip the heart immediately, revert if the save fails.
  async function handleToggleFavourite() {
    const next = !isFavourite;
    setIsFavourite(next);
    try {
      await updateDoc(doc(db, 'residents', residentId), {
        favouriteMovieVideoIds: next ? arrayUnion(videoId) : arrayRemove(videoId),
      });
    } catch (e) {
      console.error('[MoviesPlayer] failed to update favourite:', e.code, e.message, e);
      setIsFavourite(!next);
    }
  }
  // The player fills its wrapper, but the player needs explicit pixel
  // dimensions (no flex/percentage sizing), so this measures the wrapper
  // via onLayout instead of hardcoding a fixed height.
  const [playerLayout, setPlayerLayout] = useState({ width: 0, height: 0 });

  function handlePlayerLayout(e) {
    const { width, height } = e.nativeEvent.layout;
    setPlayerLayout({ width, height });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="link"
          accessibilityLabel="Back to activities"
        >
          <Text style={styles.backLink}>← Back to activities</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {videoId ? (
          <View style={styles.playerWrap} onLayout={handlePlayerLayout}>
            {playerLayout.width > 0 && playerLayout.height > 0 ? (
              // autoplay off: unlike music, a movie waits for a tap to
              // start. YouTubeEmbed already limits end-of-video suggestions
              // to the same channel (rel: false).
              <YouTubeEmbed
                height={playerLayout.height}
                width={playerLayout.width}
                videoId={videoId}
                autoplay={false}
                onEnded={session.roundCompleted}
              />
            ) : null}
            {residentId ? (
              <TouchableOpacity
                style={styles.favouriteButton}
                onPress={handleToggleFavourite}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                accessibilityState={{ selected: isFavourite }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isFavourite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={isFavourite ? colors.destructive : colors.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.artPlaceholder}>
            <Ionicons name="film-outline" size={64} color={colors.primary} />
            <Text style={styles.subtitle}>No video available for this title.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, paddingTop: 24, alignItems: 'center' },
  backLink: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.primary,
    alignSelf: 'flex-start',
    marginBottom: 32,
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  playerWrap: {
    flex: 1,
    width: '100%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.mistBackground,
  },
  // Same corner and size as MusicPlayerScreen's heart: a 44pt target with
  // a translucent backdrop so it stays visible over the video.
  favouriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: radii.circular,
    backgroundColor: 'rgba(250,250,247,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artPlaceholder: {
    flex: 1,
    width: '100%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
