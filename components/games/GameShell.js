import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, radii } from '../../theme';
import useActivitySession from '../../hooks/useActivitySession';
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
//   { difficulty, options, onComplete }
// - difficulty: 'gentle' | 'medium' | 'challenge', as picked in setup;
// - options: the on/off state of the game's extra switches, e.g.
//   { twoMoles: true } (see the `switches` prop below; {} if none);
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
//
// Play-time logging: pass `activityId` (e.g. 'molehunt') and `route`, and
// the shell records each visit in Firestore via useActivitySession — Start /
// Play again count as a round started, reaching the completion view as a
// round completed. The resident comes from route.params.residentId (none
// means Guest Mode). Without an activityId nothing is logged.
//
// Play background: a game can pass `playBackground` (an element, e.g.
// Molehunt's field) to fill the whole screen behind the header and the
// game while a round is being played. Setup and completion keep the plain
// app background.
//
// Extra switches: a game can offer caregiver-chosen on/off settings shown
// under the difficulty picker, e.g. Molehunt's "Two moles at once":
//   switches={[{ key: 'twoMoles', label: 'Two moles at once' }]}
// Each starts off; like the difficulty, the choice is kept for Play again.
//
// "Keep playing" (continuous play) is built in for every game, listed after
// the game's own switches: with it on, finishing a round goes straight into
// a fresh one (new deck, new moles, new phrases) instead of the completion
// view, so a resident who's enjoying a game is never stopped. Each round
// is still logged as started and completed. The resident or caregiver
// leaves with the usual back/home buttons.
const CONTINUOUS_SWITCH = { key: 'continuous', label: 'Keep playing' };

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
  switches = [],
  activityId,
  route,
  playBackground,
  children,
}) {
  const [phase, setPhase] = useState('setup');
  const [difficulty, setDifficulty] = useState('gentle');
  // The game's extra switches, by key; all off until the caregiver turns
  // one on.
  const [options, setOptions] = useState({});
  // Bumped for every new round; used as the game's key so it remounts.
  const [round, setRound] = useState(0);
  const session = useActivitySession({
    navigation,
    activityType: 'game',
    activityId,
    residentId: route?.params?.residentId ?? null,
    enabled: !!activityId,
  });

  function startRound() {
    session.roundStarted(difficulty);
    setRound((r) => r + 1);
    setPhase('playing');
  }

  // The game calls this once when its round ends. With "Keep playing" on,
  // the next round starts at once (the new key remounts the game).
  function completeRound() {
    session.roundCompleted();
    if (options.continuous) {
      startRound();
      return;
    }
    setPhase('complete');
  }

  const allSwitches = [...switches, CONTINUOUS_SWITCH];

  return (
    <SafeAreaView style={styles.flex}>
      {phase === 'playing' && playBackground ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {playBackground}
        </View>
      ) : null}
      <View style={styles.headerRow}>
        <BackButton navigation={navigation} style={styles.iconNoMargin} />
        <HomeButton navigation={navigation} destination="ModeSelection" />
      </View>

      {phase === 'playing' ? (
        // The game fills the rest of the screen and sizes itself to fit —
        // no scrolling while playing.
        <View key={round} style={styles.playArea}>
          {children({ difficulty, options, onComplete: completeRound })}
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
              {allSwitches.map((option) => {
                const on = !!options[option.key];
                return (
                  // A large tap-anywhere row with an on/off switch. The
                  // whole row is the button (the Switch itself ignores
                  // touches), since a lone switch is a small target. The
                  // knob position shows "on", not colour alone.
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.switchButton, on && styles.difficultySelected]}
                    onPress={() => setOptions((o) => ({ ...o, [option.key]: !on }))}
                    activeOpacity={0.8}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={option.label}
                  >
                    <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
                      <Switch
                        value={on}
                        style={styles.switch}
                        trackColor={{ false: colors.border, true: accent.icon }}
                        thumbColor={colors.white}
                        ios_backgroundColor={colors.border}
                      />
                    </View>
                    <Text style={styles.difficultyText}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
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
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    minHeight: 88,
    paddingHorizontal: 32,
    marginBottom: 32,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // The native switch is small; scale it up to suit the resident-sized row.
  switch: { transform: [{ scale: 1.4 }] },
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
