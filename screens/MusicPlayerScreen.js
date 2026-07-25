import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { DEMO_SONGS, getSongById } from '../utils/demoSongs';

const DURATION_SECONDS = 180; // fixed placeholder length — no real audio yet

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// A UI-only player mock (no real audio) for a resident session — album
// art placeholder, transport controls, and a simulated progress bar.
// Distinct from Caregiver Mode's MusicMovieRecsScreen, which is an
// AI-recommendation browser rather than a player.
export default function MusicPlayerScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const [songId, setSongId] = useState(route?.params?.songId ?? DEMO_SONGS[0].id);
  const song = getSongById(songId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const interval = setInterval(() => {
      setPosition((p) => (p >= DURATION_SECONDS ? 0 : p + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    setPosition(0);
  }, [songId]);

  function changeSong(delta) {
    const index = DEMO_SONGS.findIndex((s) => s.id === songId);
    const next = DEMO_SONGS[(index + delta + DEMO_SONGS.length) % DEMO_SONGS.length];
    setSongId(next.id);
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

        <View style={styles.artPlaceholder}>
          <Ionicons name="musical-notes" size={64} color={colors.primary} />
        </View>

        <Text style={styles.title}>{song.title}</Text>
        <Text style={styles.subtitle}>
          {song.artist} · {song.year}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(position / DURATION_SECONDS) * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(DURATION_SECONDS)}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => changeSong(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
          >
            <Ionicons name="play-skip-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.playButton]}
            onPress={() => setIsPlaying((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => changeSong(1)}
            accessibilityRole="button"
            accessibilityLabel="Next"
          >
            <Ionicons name="play-skip-forward" size={28} color={colors.textPrimary} />
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
  artPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: radii.lg,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 32,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: radii.circular,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  timeText: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
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
});
