import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Player dimensions come from measuring its own wrapper rather than
  // useWindowDimensions, so the SAME YoutubePlayer instance just gets
  // reflowed to a new size on fullscreen toggle instead of being unmounted
  // and remounted — remounting would reload the WebView and restart
  // playback from the beginning every time.
  const [playerLayout, setPlayerLayout] = useState({ width: 0, height: 0 });

  function handlePlayerLayout(e) {
    const { width, height } = e.nativeEvent.layout;
    setPlayerLayout({ width, height });
  }

  // app.json has expo.orientation set to "default" (unlocked), so exiting
  // fullscreen restores that via OrientationLock.DEFAULT rather than a
  // hardcoded PORTRAIT_UP, which would fight the app's normal orientation
  // policy on devices/tablets that otherwise rotate freely.
  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
  }, []);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  // Restore the app's default orientation if this screen unmounts (e.g. the
  // resident/caregiver navigates away) while still fullscreen, so the rest
  // of the app doesn't inherit a landscape lock.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    };
  }, []);

  // Hardware back (Android) and the swipe-back gesture (iOS) both fire
  // 'beforeRemove' before React Navigation actually removes the screen —
  // intercepting that while fullscreen exits fullscreen instead of leaving
  // the player entirely, matching the toggle button's behavior.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isFullscreen) return;
      e.preventDefault();
      exitFullscreen();
    });
    return unsubscribe;
  }, [navigation, isFullscreen, exitFullscreen]);

  return (
    <SafeAreaView style={styles.flex}>
      <StatusBar hidden={isFullscreen} />
      <View style={[styles.content, isFullscreen && styles.contentFullscreen]}>
        {!isFullscreen ? (
          <>
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
          </>
        ) : null}

        {videoId ? (
          <View
            style={[styles.playerWrap, isFullscreen && styles.playerWrapFullscreen]}
            onLayout={handlePlayerLayout}
          >
            {playerLayout.width > 0 && playerLayout.height > 0 ? (
              <YoutubePlayer
                height={playerLayout.height}
                width={playerLayout.width}
                videoId={videoId}
                // YouTube's own native fullscreen control as a fallback.
                webViewProps={{ allowsFullscreenVideo: true }}
              />
            ) : null}
            <TouchableOpacity
              style={styles.fullscreenToggle}
              onPress={isFullscreen ? exitFullscreen : enterFullscreen}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={20} color={colors.white} />
            </TouchableOpacity>
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
  contentFullscreen: { padding: 0, alignItems: 'stretch' },
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
  playerWrapFullscreen: {
    borderRadius: 0,
    borderWidth: 0,
  },
  fullscreenToggle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
