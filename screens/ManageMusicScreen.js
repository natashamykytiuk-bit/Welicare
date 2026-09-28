import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Entry point for the curated libraries, reached from Caregiver Mode's
// "Manage Music & Videos" quick link. Routes to the management screens for
// each independent library: music (MusicLibraryScreen,
// CurateResidentMusicScreen) and movies (MovieLibraryScreen,
// CurateResidentMoviesScreen). Residents only ever browse what's added and
// approved here.
export default function ManageMusicScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Manage Music & Videos</Text>
        <Text style={styles.body}>
          Build the music and movie libraries and choose what each resident sees.
        </Text>

        <Text style={styles.sectionLabel}>Music</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('MusicLibrary')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Music Library"
        >
          <Text style={styles.cardTitle}>Music Library</Text>
          <Text style={styles.cardSubtitle}>
            Search, add, and edit videos in the shared library
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('CurateResidentMusic')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Curate for Resident"
        >
          <Text style={styles.cardTitle}>Curate for Resident</Text>
          <Text style={styles.cardSubtitle}>Choose which library videos a resident sees</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Movies &amp; Videos</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('MovieLibrary')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Movie Library"
        >
          <Text style={styles.cardTitle}>Movie Library</Text>
          <Text style={styles.cardSubtitle}>
            Search, add, and edit movies and shows residents can watch
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('CurateResidentMovies')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Curate Movies for Resident"
        >
          <Text style={styles.cardTitle}>Curate Movies for Resident</Text>
          <Text style={styles.cardSubtitle}>Choose which movies a resident can watch</Text>
        </TouchableOpacity>
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
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  // Small uppercase heading above each library's pair of cards.
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.primary,
  },
});
