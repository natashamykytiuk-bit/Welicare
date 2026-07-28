import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { colors, fonts, radii } from '../theme';

// Real YouTube-backed playback via react-native-youtube-iframe — the
// Movies & Videos equivalent of MusicPlayerScreen, see there for where
// videoId/title come from. Playback itself (play/pause/seek/progress) is
// entirely YouTube's own embedded controls — controls defaults to true on
// YoutubePlayer, so it's left unset rather than passed explicitly.
export default function MoviesPlayerScreen({ navigation, route }) {
  const videoId = route?.params?.videoId;
  const title = route?.params?.title ?? 'Untitled';
  // The player fills its wrapper, but YoutubePlayer needs explicit pixel
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
              <YoutubePlayer height={playerLayout.height} width={playerLayout.width} videoId={videoId} />
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
