import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

// Entry point for the curated video library, reached from Caregiver Mode's
// "Manage Music & Videos" quick link. Just routes to the two management
// screens — MusicLibraryScreen (add/edit/remove entries) and
// CurateResidentMusicScreen (pick which entries a specific resident sees).
export default function ManageMusicScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Manage Music & Videos</Text>
        <Text style={styles.body}>
          Curate the shared video library and choose what each resident sees.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('MusicLibrary')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Music Library"
        >
          <Text style={styles.cardTitle}>Music Library</Text>
          <Text style={styles.cardSubtitle}>Search, add, and edit videos in the shared library</Text>
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
