import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Real YouTube-backed playback via react-native-youtube-iframe, replacing
// the old fake progress-bar/interval mock — see MusicSelectionScreen for
// where videoId/title come from. Distinct from Caregiver Mode's
// MusicMovieRecsScreen, which is an AI-recommendation browser rather than a
// player. There's no next/previous here (unlike the old DEMO_SONGS build):
// this screen only ever gets a single { videoId, title } pair from whatever
// search result was tapped, not a playlist to page through.
//
// Playback itself (play/pause/seek/progress) is entirely YouTube's own
// embedded controls — controls defaults to true on YoutubePlayer, so it's
// left unset rather than passed explicitly. The app doesn't track play
// state or position; there's nothing left here to keep in sync with it.
export default function MusicPlayerScreen({ navigation, route }) {
  const videoId = route?.params?.videoId;
  const title = route?.params?.title ?? 'Untitled';
  const residentId = route?.params?.residentId;
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
              <YoutubePlayer height={playerLayout.height} width={playerLayout.width} videoId={videoId} />
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
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
