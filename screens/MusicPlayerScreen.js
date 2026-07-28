import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
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
export default function MusicPlayerScreen({ navigation, route }) {
  const videoId = route?.params?.videoId;
  const title = route?.params?.title ?? 'Untitled';
  const [playing, setPlaying] = useState(true);

  // react-native-youtube-iframe calls this on every player state change
  // (buffering, paused, playing, ended...) — only "ended" needs handling,
  // so our big play/pause button doesn't stay stuck showing "pause" after
  // the video finishes on its own.
  const onPlayerStateChange = useCallback((state) => {
    if (state === 'ended') setPlaying(false);
  }, []);

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
          <View style={styles.playerWrap}>
            <YoutubePlayer height={220} play={playing} videoId={videoId} onChangeState={onPlayerStateChange} />
          </View>
        ) : (
          <View style={styles.artPlaceholder}>
            <Ionicons name="musical-notes" size={64} color={colors.primary} />
            <Text style={styles.subtitle}>No video available for this song.</Text>
          </View>
        )}

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.playButton, !videoId && styles.controlButtonDisabled]}
            onPress={() => setPlaying((p) => !p)}
            disabled={!videoId}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.white} />
          </TouchableOpacity>
        </View>
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
    marginBottom: 28,
  },
  playerWrap: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: 40,
    backgroundColor: colors.mistBackground,
  },
  artPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: radii.lg,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 12,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    backgroundColor: colors.primary,
  },
  controlButtonDisabled: { opacity: 0.5 },
});
