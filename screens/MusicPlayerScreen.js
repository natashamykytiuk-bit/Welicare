import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { rankBySimilarity } from '../utils/songSimilarity';

// Real YouTube-backed playback via react-native-youtube-iframe, replacing
// the old fake progress-bar/interval mock — see MusicSelectionScreen for
// where videoId/title come from. Distinct from Caregiver Mode's
// MusicMovieRecsScreen, which is an AI-recommendation browser rather than a
// player.
//
// Queue: MusicSelectionScreen passes the whole list it was showing as
// `queue` plus `startIndex` for the tapped song, so the songs after it play
// as "Up next" — auto-advancing when one ends, with previous/next buttons
// and a tappable list to jump ahead. Up next is ordered by tag similarity
// (genre/decade/artist) to whatever's currently playing, see
// utils/songSimilarity. Callers that only pass a single
// { videoId, title } (or a song with no videoId) get a one-song queue.
//
// Playback itself (play/pause/seek/progress) is entirely YouTube's own
// embedded controls — controls defaults to true on YoutubePlayer, so it's
// left unset rather than passed explicitly. The only player state the app
// listens for is 'ended', to move on to the next song.
export default function MusicPlayerScreen({ navigation, route }) {
  const params = route?.params ?? {};
  const residentId = params.residentId;
  // Only trust the passed queue if it actually lines up with the tapped
  // song — otherwise (no queue, or tapped song had no videoId and was
  // filtered out of it) fall back to playing just that one song.
  const passedQueue = Array.isArray(params.queue) ? params.queue : null;
  const queueMatches =
    passedQueue && params.videoId && passedQueue[params.startIndex]?.videoId === params.videoId;
  // Queue state is { list, index }: list[0..index] is what's been played
  // (so Previous walks back through real history), list[index+1..] is Up
  // next, kept ranked by similarity to the current song. Initialised
  // lazily so the ranking only runs once, not on every render.
  const [{ list: queue, index: currentIndex }, setQueueState] = useState(() => {
    if (!queueMatches) {
      return { list: [{ videoId: params.videoId, title: params.title }], index: 0 };
    }
    const played = passedQueue.slice(0, params.startIndex + 1);
    const rest = passedQueue.slice(params.startIndex + 1);
    return {
      list: [...played, ...rankBySimilarity(passedQueue[params.startIndex], rest)],
      index: params.startIndex,
    };
  });
  const current = queue[currentIndex] ?? {};
  const videoId = current.videoId;
  const title = current.title ?? 'Untitled';
  const upNext = queue.slice(currentIndex + 1);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < queue.length - 1;
  // The player fills its wrapper, but YoutubePlayer needs explicit pixel
  // dimensions (no flex/percentage sizing), so this measures the wrapper
  // via onLayout instead of hardcoding a fixed height.
  const [playerLayout, setPlayerLayout] = useState({ width: 0, height: 0 });
  // Only meaningful when residentId is present (e.g. not Guest Mode, which
  // has no resident doc to store a favourite against) — the heart button
  // itself is hidden in that case, see below.
  const [isFavourite, setIsFavourite] = useState(false);

  function handlePlayerLayout(e) {
    const { width, height } = e.nativeEvent.layout;
    setPlayerLayout({ width, height });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadFavourite() {
      if (!residentId || !videoId) return;
      const snap = await getDoc(doc(db, 'residents', residentId));
      if (cancelled) return;
      const ids = snap.data()?.favouriteMusicVideoIds;
      setIsFavourite(Array.isArray(ids) && ids.includes(videoId));
    }
    loadFavourite();
    return () => {
      cancelled = true;
    };
  }, [residentId, videoId]);

  // Auto-advance through the queue when a song finishes. Stops quietly at
  // the end of the queue rather than looping, so a resident isn't left
  // with music that never ends.
  const handleStateChange = useCallback((state) => {
    if (state === 'ended') playUpNext(0);
  }, []);

  // Plays the Up next song at `offset` (0 = the top of Up next) and
  // re-ranks whatever's left by similarity to *that* song, so the queue
  // follows along if a resident jumps to something different. Songs
  // jumped over stay in Up next rather than being dropped.
  function playUpNext(offset) {
    setQueueState(({ list, index }) => {
      const played = list.slice(0, index + 1);
      const rest = list.slice(index + 1);
      if (offset >= rest.length) return { list, index };
      const [picked] = rest.splice(offset, 1);
      return { list: [...played, picked, ...rankBySimilarity(picked, rest)], index: index + 1 };
    });
  }

  // Previous just steps back through history — no re-ranking, so going
  // back and forward again lands on the same songs.
  function playPrevious() {
    setQueueState(({ list, index }) => ({ list, index: Math.max(0, index - 1) }));
  }

  async function handleToggleFavourite() {
    const next = !isFavourite;
    // Optimistic: flip the icon immediately rather than waiting on the
    // write, then revert if it turns out to have failed.
    setIsFavourite(next);
    try {
      await updateDoc(doc(db, 'residents', residentId), {
        favouriteMusicVideoIds: next ? arrayUnion(videoId) : arrayRemove(videoId),
      });
    } catch (e) {
      console.error('[MusicPlayer] failed to update favourite:', e.code, e.message, e);
      setIsFavourite(!next);
    }
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
              // play is true so a queued song starts by itself after the
              // previous one ends (or after next/previous/Up next taps)
              // instead of waiting for another tap on the video.
              <YoutubePlayer
                height={playerLayout.height}
                width={playerLayout.width}
                videoId={videoId}
                play
                onChangeState={handleStateChange}
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
            <Ionicons name="musical-notes" size={64} color={colors.primary} />
            <Text style={styles.subtitle}>No video available for this song.</Text>
          </View>
        )}

        {/* Previous/next only appear when there's actually a queue to move
            through — a single song keeps the screen as simple as before. */}
        {queue.length > 1 ? (
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, !hasPrevious && styles.controlDisabled]}
              onPress={playPrevious}
              disabled={!hasPrevious}
              accessibilityRole="button"
              accessibilityLabel="Previous song"
              accessibilityState={{ disabled: !hasPrevious }}
            >
              <Ionicons name="play-skip-back" size={28} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.position}>
              {currentIndex + 1} of {queue.length}
            </Text>
            <TouchableOpacity
              style={[styles.controlButton, !hasNext && styles.controlDisabled]}
              onPress={() => playUpNext(0)}
              disabled={!hasNext}
              accessibilityRole="button"
              accessibilityLabel="Next song"
              accessibilityState={{ disabled: !hasNext }}
            >
              <Ionicons name="play-skip-forward" size={28} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {upNext.length > 0 ? (
          <View style={styles.upNext}>
            <Text style={styles.upNextHeading}>Up next</Text>
            <ScrollView style={styles.upNextList}>
              {upNext.map((song, i) => (
                <TouchableOpacity
                  key={`${song.videoId}-${i}`}
                  style={styles.upNextItem}
                  onPress={() => playUpNext(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${song.title}`}
                >
                  <Ionicons name="musical-note" size={18} color={colors.textMuted} />
                  <Text style={styles.upNextTitle} numberOfLines={1}>
                    {song.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
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
  // Sits top-right of the player, same corner the old fullscreen button
  // used before it was removed — min 44x44pt tappable target via padding
  // around a smaller icon, with a translucent backdrop so it stays visible
  // over light video content.
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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
  },
  // 56pt circles — larger than the usual 44pt minimum since residents may
  // have limited dexterity.
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: radii.circular,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: { opacity: 0.35 },
  position: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.textMuted },
  upNext: { width: '100%', marginTop: 16, maxHeight: 200 },
  upNextHeading: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  upNextList: { flexGrow: 0 },
  upNextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  upNextTitle: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 16, color: colors.textPrimary },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
