import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import { colors, fonts, radii } from '../theme';

// The games a resident can pick. Memory Match is fully built (on the shared
// GameShell); the others are still placeholders.
const GAMES = [
  { label: 'Memory Match', screen: 'MemoryMatch', icon: 'grid-outline' },
  { label: 'Word Games', screen: 'WordGames', icon: 'text-outline' },
  { label: 'Molehunt', screen: 'Molehunt', icon: 'search-outline' },
];

// Resident Mode → Games. Same look as ActivityMenuScreen: large, uniform
// tiles in the games accent colour with the icon beside a resident-scale
// label. Header: back to the activity menu, plus the PIN-gated home icon
// (HomeButton) like every other Resident Mode activity screen.
export default function GamesScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const accent = colors.activities.games;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
          <HomeButton navigation={navigation} destination="ModeSelection" />
        </View>

        <Text style={styles.heading}>Games</Text>
        <Text style={styles.body}>Pick a game to play.</Text>

        <View style={styles.grid}>
          {GAMES.map((game) => (
            <TouchableOpacity
              key={game.screen}
              style={[styles.tile, { backgroundColor: accent.bg }]}
              // residentId passed along for future per-resident features.
              onPress={() => navigation.navigate(game.screen, { residentId })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={game.label}
            >
              <Ionicons name={game.icon} size={34} color={colors.textPrimary} />
              <Text style={styles.tileLabel}>{game.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Tile and text sizes mirror ActivityMenuScreen's, so the two menus feel
// like one continuous place for the resident.
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
    fontSize: 32,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 24,
    color: colors.textMuted,
    lineHeight: 32,
    marginBottom: 24,
  },
  // Two tiles per row, flush to both edges — same layout rules as
  // ActivityMenuScreen's grid (see the comments there).
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  tile: {
    width: '48.5%',
    height: 132,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tileLabel: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
});
