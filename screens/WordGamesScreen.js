import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GameShell from '../components/games/GameShell';
import gentleHaptic from '../components/games/gentleHaptic';
import ProgressDots from '../components/games/ProgressDots';
import { buildRound, isCorrect, isRoundComplete } from '../games/finishThePhrase/logic';
import { colors, fonts, radii } from '../theme';

// How long a finished phrase stays on screen, completed, before the next
// one — long enough to read it through and enjoy getting it.
const NEXT_PHRASE_DELAY_MS = 1800;

const accent = colors.activities.games;

// Resident Mode → Games → Word Games. For now this goes straight to Finish
// the Phrase, the only word game so far; when more are added this screen
// can become a small menu of them. GameShell supplies the header,
// difficulty picker and completion view; this screen only plays a round.
export default function WordGamesScreen({ navigation, route }) {
  return (
    <GameShell
      navigation={navigation}
      route={route}
      activityId="wordGames"
      title="Finish the Phrase"
      description="Choose the word that finishes each familiar saying."
      completionMessage="Wonderful! You finished every phrase."
    >
      {({ difficulty, onComplete }) => (
        <FinishThePhraseBoard difficulty={difficulty} onComplete={onComplete} />
      )}
    </GameShell>
  );
}

// One round of five phrases (buildRound).
//
// A tap on a word button:
// - the right word: the blank fills in, the phrase gives a soft pulse and a
//   light haptic plays; after NEXT_PHRASE_DELAY_MS the next phrase appears
//   (or, after the last one, onComplete() shows the completion view).
// - any other word: that button quietly fades and stops responding. No
//   message, no colour — the resident simply has one fewer to choose from.
export function FinishThePhraseBoard({ difficulty, onComplete }) {
  // Built once per round (GameShell remounts this for each round).
  const [round] = useState(() => buildRound(difficulty));
  const [index, setIndex] = useState(0);
  // Words already tried for the current phrase (shown faded).
  const [faded, setFaded] = useState(() => new Set());
  const [solved, setSolved] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  // Pending timers, cleared if the resident leaves mid-round.
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const { phrase, choices } = round[index];

  function handleChoice(word) {
    // Ignore taps while the finished phrase is showing, and on faded words.
    if (solved || faded.has(word)) return;
    if (!isCorrect(phrase, word)) {
      setFaded(new Set(faded).add(word));
      return;
    }
    setSolved(true);
    gentleHaptic();
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
    later(() => {
      const answered = index + 1;
      if (isRoundComplete(answered, round)) {
        onComplete();
        return;
      }
      setIndex(answered);
      setFaded(new Set());
      setSolved(false);
    }, NEXT_PHRASE_DELAY_MS);
  }

  const answered = index + (solved ? 1 : 0);

  return (
    <View style={styles.area}>
      <Animated.View style={[styles.phraseCard, { transform: [{ scale: pulse }] }]}>
        <Text
          style={styles.phrase}
          accessibilityLabel={
            solved
              ? `${phrase.before} ${phrase.answer} ${phrase.after}`.trim()
              : `${phrase.before} blank ${phrase.after}`.trim()
          }
        >
          {phrase.before} {/* The blank, then the answer in the games accent once found. */}
          <Text style={solved ? styles.answer : styles.blank}>
            {solved ? phrase.answer : '_____'}
          </Text>
          {phrase.after ? ` ${phrase.after}` : ''}
        </Text>
      </Animated.View>

      <View style={styles.choices}>
        {choices.map((word) => {
          const isFaded = faded.has(word);
          return (
            <TouchableOpacity
              key={word}
              style={[styles.choice, isFaded && styles.choiceFaded]}
              onPress={() => handleChoice(word)}
              disabled={isFaded || solved}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={word}
              accessibilityState={{ disabled: isFaded || solved }}
            >
              <Text style={styles.choiceText}>{word}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ProgressDots
        done={answered}
        total={round.length}
        label={`${answered} of ${round.length} phrases finished`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phraseCard: {
    maxWidth: 900,
    paddingVertical: 40,
    paddingHorizontal: 48,
    marginBottom: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: accent.bg,
  },
  phrase: {
    fontFamily: fonts.serifBold,
    fontSize: 44,
    lineHeight: 60,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  blank: { color: colors.textMuted },
  answer: { color: accent.icon },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
  },
  choice: {
    minWidth: 200,
    minHeight: 96,
    paddingHorizontal: 32,
    borderRadius: radii.lg,
    backgroundColor: accent.bg,
    borderWidth: 3,
    borderColor: accent.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A tried word just fades back — same colours, lower opacity.
  choiceFaded: { opacity: 0.3 },
  choiceText: {
    fontFamily: fonts.sansBold,
    fontSize: 34,
    color: colors.textPrimary,
  },
});
