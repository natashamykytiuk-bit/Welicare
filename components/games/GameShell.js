import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../../theme';
import BackButton from '../BackButton';
import HomeButton from '../HomeButton';

// The frame every Resident Mode game sits in (MemoryMatchScreen now;
// Molehunt and Word Games later), so they all look and behave the same:
//
//   1. "setup"    — the game's title, a difficulty picker (Gentle is
//                   pre-selected) and a big Start button.
//   2. "playing"  — the game itself, drawn by the screen that uses the
//                   shell (see "How a game plugs in" below).
//   3. "complete" — a warm message with Play again / Back to games.
//
// The header is always the same: a back button (to GamesScreen — back is
// never PIN-gated, it stays inside Resident Mode) and the PIN-gated home
// icon shared with PlaceholderScreen (HomeButton).
//
// Resident Mode game rules (see CLAUDE.md): nothing here ever says "wrong",
// counts down, or ends a game badly — a round can only end in "complete".
//
// How a game plugs in: pass a function as the child. The shell calls it
// while a round is being played with
//   { difficulty, onComplete }
// - difficulty: 'gentle' | 'medium' | 'challenge', as picked in setup;
// - onComplete: the game calls this once when the round is finished, and
//   the shell switches to the completion view.
// Each round is rendered with a fresh React key, so "Play again" always
// starts the game from a clean slate (new deck, nothing flipped).
//
// Example:
//   <GameShell navigation={navigation} title="Memory Match">
//     {({ difficulty, onComplete }) => (
//       <MemoryMatchBoard difficulty={difficulty} onComplete={onComplete} />
//     )}
//   </GameShell>

export const DIFFICULTIES = [
  { key: 'gentle', label: 'Gentle' },
  { key: 'medium', label: 'Medium' },
  { key: 'challenge', label: 'Challenge' },
];

export default function GameShell({
  navigation,
  title,
  description,
  completionMessage = 'Wonderful! You found them all.',
  children,
}) {
  const [phase, setPhase] = useState('setup');
  const [difficulty, setDifficulty] = useState('gentle');
  // Bumped for every new round; used as the game's key so it remounts.
  const [round, setRound] = useState(0);

  function startRound() {
    setRound((r) => r + 1);
    setPhase('playing');
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.headerRow}>
        <BackButton navigation={navigation} style={styles.iconNoMargin} />
        <HomeButton navigation={navigation} destination="ModeSelection" />
      </View>

      {phase === 'playing' ? (
        // The game fills the rest of the screen and sizes itself to fit —
        // no scrolling while playing.
        <View key={round} style={styles.playArea}>
          {children({ difficulty, onComplete: () => setPhase('complete') })}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.centred}>
          {phase === 'setup' ? (
            <>
              <Text style={styles.heading}>{title}</Text>
              {description ? <Text style={styles.body}>{description}</Text> : null}
              <View style={styles.difficultyRow} accessibilityRole="radiogroup">
                {DIFFICULTIES.map((option) => {
                  const selected = option.key === difficulty;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.difficultyButton, selected && styles.difficultySelected]}
                      onPress={() => setDifficulty(option.key)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={option.label}
                    >
                      <Text
                        style={[styles.difficultyText, selected && styles.difficultyTextSelected]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <BigButton label="Start" onPress={startRound} />
            </>
          ) : (
            <>
              <Text style={styles.heading}>{completionMessage}</Text>
              <View style={styles.completeButtons}>
                <BigButton label="Play again" onPress={startRound} />
                <BigButton label="Back to games" onPress={() => navigation.goBack()} secondary />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// The large rounded action button used for Start / Play again / Back to
// games — wide, tall and with resident-scale text.
function BigButton({ label, onPress, secondary }) {
  return (
    <TouchableOpacity
      style={[styles.bigButton, secondary && styles.bigButtonSecondary]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.bigButtonText, secondary && styles.bigButtonTextSecondary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const accent = colors.activities.games;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 8,
  },
  iconNoMargin: { marginBottom: 0 },
  playArea: { flex: 1, paddingHorizontal: 28, paddingBottom: 24 },
  centred: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 40,
    lineHeight: 50,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 24,
    lineHeight: 32,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
  },
  difficultyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  difficultyButton: {
    minWidth: 180,
    minHeight: 88,
    paddingHorizontal: 24,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The chosen level: filled with the games accent and outlined in its
  // icon colour, so it stands out without relying on colour alone (the
  // thicker border also changes).
  difficultySelected: {
    backgroundColor: accent.bg,
    borderColor: accent.icon,
  },
  difficultyText: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    color: colors.textPrimary,
  },
  difficultyTextSelected: { color: colors.textPrimary },
  completeButtons: { gap: 16, alignItems: 'center', marginTop: 16 },
  bigButton: {
    minWidth: 320,
    minHeight: 88,
    paddingHorizontal: 32,
    borderRadius: radii.lg,
    backgroundColor: accent.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: accent.icon,
  },
  bigButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    color: colors.white,
  },
  bigButtonTextSecondary: { color: colors.textPrimary },
});
