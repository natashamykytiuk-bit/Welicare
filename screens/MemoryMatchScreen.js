import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import GameShell from '../components/games/GameShell';
import gentleHaptic from '../components/games/gentleHaptic';
import { buildDeck, canFlip, isMatch, isRoundComplete } from '../games/memoryMatch/logic';
import { colors, radii } from '../theme';

// How long a non-matching pair stays visible before calmly turning back.
const MISMATCH_PAUSE_MS = 1500;
// A short beat after the last pair so its pulse is seen before the
// completion message appears.
const COMPLETE_DELAY_MS = 900;
// Space between cards.
const GAP = 16;
// Columns × rows for each deck size, to suit a landscape iPad. 16 cards
// (Challenge) is a square 4 × 4 — every row full, and the cards stay as
// large as the screen allows (sized to fit below).
const GRID = { 6: [3, 2], 8: [4, 2], 12: [4, 3], 16: [4, 4] };

// Resident Mode → Games → Memory Match. GameShell supplies the header,
// difficulty picker and completion view; this screen only plays one round.
export default function MemoryMatchScreen({ navigation, route }) {
  return (
    <GameShell
      navigation={navigation}
      route={route}
      activityId="memoryMatch"
      title="Memory Match"
      description="Turn over two cards at a time to find the pictures that match."
    >
      {({ difficulty, onComplete }) => (
        <MemoryMatchBoard difficulty={difficulty} onComplete={onComplete} />
      )}
    </GameShell>
  );
}

// One round of the game. Holds the round's state and hands every decision
// to the pure rules in games/memoryMatch/logic.js.
//
// A tap, step by step (handlePress):
//   1. canFlip() says whether this card may turn over now; if not, nothing
//      happens (e.g. during the pause after a non-matching pair).
//   2. The card is added to faceUpIds, and its Card component animates to
//      show its picture.
//   3. With two cards showing, isMatch() decides:
//      - match: both go into matchedIds (they stay face up and pulse), a
//        light haptic plays, and faceUpIds empties for the next turn. If
//        isRoundComplete() is now true, onComplete() tells GameShell to show
//        the completion view.
//      - no match: `paused` blocks taps, and after MISMATCH_PAUSE_MS both
//        cards simply turn back over. Nothing else — no message, no colour.
export function MemoryMatchBoard({ difficulty, onComplete }) {
  // Built once per round (GameShell remounts this component for each round).
  const [cards] = useState(() => buildDeck(difficulty));
  const [faceUpIds, setFaceUpIds] = useState([]);
  const [matchedIds, setMatchedIds] = useState(() => new Set());
  const [paused, setPaused] = useState(false);
  // The play area's size, measured on layout, to size cards to fit.
  const [area, setArea] = useState(null);

  // Pending timers, cleared if the resident leaves mid-round so nothing
  // fires on an unmounted screen.
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  function handlePress(card) {
    if (!canFlip(card, { faceUpIds, matchedIds, paused })) return;
    const showing = [...faceUpIds, card.id];
    if (showing.length < 2) {
      setFaceUpIds(showing);
      return;
    }
    const first = cards.find((c) => c.id === showing[0]);
    if (isMatch(first, card)) {
      const nextMatched = new Set(matchedIds).add(first.id).add(card.id);
      setMatchedIds(nextMatched);
      setFaceUpIds([]);
      gentleHaptic();
      if (isRoundComplete(cards, nextMatched)) later(onComplete, COMPLETE_DELAY_MS);
    } else {
      setFaceUpIds(showing);
      setPaused(true);
      later(() => {
        setFaceUpIds([]);
        setPaused(false);
      }, MISMATCH_PAUSE_MS);
    }
  }

  // Largest square card that fits the grid inside the measured area, so
  // every difficulty fits on one screen without scrolling.
  const [cols, rows] = GRID[cards.length] ?? [4, Math.ceil(cards.length / 4)];
  const size = area
    ? Math.floor(
        Math.min((area.width - GAP * (cols - 1)) / cols, (area.height - GAP * (rows - 1)) / rows)
      )
    : 0;

  return (
    <View
      style={styles.area}
      onLayout={(e) => setArea(e.nativeEvent.layout)}
      accessibilityLabel="Memory Match cards"
    >
      {size > 0 ? (
        <View style={[styles.grid, { width: size * cols + GAP * (cols - 1) }]}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              size={size}
              faceUp={faceUpIds.includes(card.id) || matchedIds.has(card.id)}
              matched={matchedIds.has(card.id)}
              onPress={() => handlePress(card)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// A single card. `faceUp` drives a short cross-fade between the back and the
// picture (a fade reads more calmly than a spinning flip); `matched` plays
// one soft pulse when the pair is found.
function Card({ card, size, faceUp, matched, onPress }) {
  const reveal = useRef(new Animated.Value(faceUp ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: faceUp ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [faceUp, reveal]);

  useEffect(() => {
    if (!matched) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.08, duration: 180, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [matched, scale]);

  const accent = colors.activities[card.accent];
  const backOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={faceUp ? `${card.label}${matched ? ', matched' : ''}` : 'Card, face down'}
    >
      <Animated.View style={[styles.card, { width: size, height: size, transform: [{ scale }] }]}>
        {/* Picture side */}
        <Animated.View style={[styles.face, { backgroundColor: accent.bg, opacity: reveal }]}>
          <Ionicons name={card.icon} size={size * 0.5} color={accent.icon} />
        </Animated.View>
        {/* Back side, faded out as the picture fades in */}
        <Animated.View
          style={[styles.face, styles.back, { opacity: backOpacity }]}
          pointerEvents="none"
        >
          <Ionicons name="leaf-outline" size={size * 0.3} color={colors.activities.games.bg} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  // Plain, calm back: the games accent colour with a small leaf motif.
  back: {
    backgroundColor: colors.activities.games.icon,
  },
});
