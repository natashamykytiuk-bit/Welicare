import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';
import { DEMO_SONGS } from '../utils/demoSongs';

// Browse screen shown before MusicPlayerScreen — lets the caregiver or
// resident pick a song first instead of landing straight in a player.
export default function MusicSelectionScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Music</Text>
        <Text style={styles.body}>Choose a song to play.</Text>

        {DEMO_SONGS.map((song) => (
          <TouchableOpacity
            key={song.id}
            style={styles.card}
            onPress={() => navigation.navigate('MusicPlayer', { songId: song.id, residentId })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${song.title} by ${song.artist}`}
          >
            <View style={styles.artPlaceholder}>
              <Ionicons name="musical-note" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {song.artist} · {song.year}
              </Text>
            </View>
            <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
        ))}
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
    marginBottom: 24,
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
    marginBottom: 12,
  },
  artPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
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
});
