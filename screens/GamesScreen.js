import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';

const GAMES = [
  { label: 'Word Games', screen: 'WordGames' },
  { label: 'Molehunt', screen: 'Molehunt' },
];

// One of the activity options on ActivityMenuScreen. Lists the game
// types available for this resident; each one navigates to its own
// (currently placeholder) screen.
export default function GamesScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>

        <Text style={styles.heading}>Games</Text>
        <Text style={styles.body}>Simple, engaging games designed for this resident.</Text>

        {GAMES.map((game) => (
          <TouchableOpacity
            key={game.screen}
            style={styles.card}
            onPress={() => navigation.navigate(game.screen)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={game.label}
          >
            <Text style={styles.cardTitle}>{game.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconNoMargin: { marginBottom: 0 },
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
});
