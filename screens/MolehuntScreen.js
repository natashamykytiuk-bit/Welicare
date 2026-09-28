import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import GameShell from '../components/games/GameShell';
import gentleHaptic from '../components/games/gentleHaptic';
import {
  isRoundComplete,
  levelFor,
  pickNextHole,
  shouldShowAnother,
  startingHoles,
} from '../games/molehunt/logic';
import { colors, radii } from '../theme';

// A calm beat between a mole sinking and a new one peeking out. This is
// pacing only — the new mole then waits as long as it takes.
const NEXT_MOLE_DELAY_MS = 600;
// Lets the last mole's pulse be seen before the completion message.
const COMPLETE_DELAY_MS = 900;
// Space between molehills.
const GAP = 24;
// Height kept below the board for the progress dots.
const PROGRESS_SPACE = 64;
// Molehills are always laid out three to a row (1, 2 or 3 rows).
const COLUMNS = 3;

const accent = colors.activities.games;
// Earthy molehill colours, borrowed from the photo album tile so they stay
// within the theme.
const earth = colors.activities.photoAlbum;

// Resident Mode → Games → Molehunt. GameShell supplies the header,
// difficulty picker, the "Two moles at once" switch and the completion
// view; this screen only plays one round.
export default function MolehuntScreen({ navigation }) {
  return (
    <GameShell
      navigation={navigation}
      title="Molehunt"
      description="A friendly mole is peeking out. Tap it when you spot it!"
      completionMessage="Wonderful! You found all the moles."
      switches={[{ key: 'twoMoles', label: 'Two moles at once' }]}
    >
      {({ difficulty, options, onComplete }) => (
        <MolehuntBoard
          difficulty={difficulty}
          twoMoles={!!options.twoMoles}
          onComplete={onComplete}
        />
      )}
    </GameShell>
  );
}

// One round. `activeHoles` are the holes with a mole up (one, or two with
// the switch on); `found` only ever counts up.
//
// A tap on a mole: light haptic, the mole pulses and sinks, `found` goes
// up, and — if the round still has moles to come (shouldShowAnother) —
// after NEXT_MOLE_DELAY_MS a new one appears in a hole that is neither
// occupied nor the one just emptied. Taps on empty molehills are ignored:
// there is no "miss".
//
// The round's counters live in refs as well as state because the delayed
// "show a new mole" callback runs later, when the state it closed over may
// be stale (e.g. the other mole was found in the meantime).
export function MolehuntBoard({ difficulty, twoMoles, onComplete }) {
  const { holes, moles } = levelFor(difficulty);
  const [activeHoles, setActiveHoles] = useState(() => startingHoles(holes, twoMoles));
  const [found, setFound] = useState(0);
  const [area, setArea] = useState(null);
  const active = useRef(activeHoles);
  const foundCount = useRef(0);
  const shown = useRef(activeHoles.length);

  // Pending timers, cleared if the resident leaves mid-round.
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  function updateActive(next) {
    active.current = next;
    setActiveHoles(next);
  }

  function handleFound(hole) {
    if (!active.current.includes(hole)) return; // already found
    gentleHaptic();
    foundCount.current += 1;
    setFound(foundCount.current);
    updateActive(active.current.filter((h) => h !== hole));
    if (isRoundComplete(foundCount.current, difficulty)) {
      later(onComplete, COMPLETE_DELAY_MS);
      return;
    }
    if (!shouldShowAnother(shown.current, difficulty)) return;
    shown.current += 1;
    later(() => {
      const next = pickNextHole(holes, [...active.current, hole], Math.random, active.current);
      updateActive([...active.current, next]);
    }, NEXT_MOLE_DELAY_MS);
  }

  // Largest round molehill that fits the grid in the measured area.
  const rows = Math.ceil(holes / COLUMNS);
  const size = area
    ? Math.floor(
        Math.min(
          (area.width - GAP * (COLUMNS - 1)) / COLUMNS,
          (area.height - PROGRESS_SPACE - GAP * (rows - 1)) / rows
        )
      )
    : 0;

  return (
    <View
      style={styles.area}
      onLayout={(e) => setArea(e.nativeEvent.layout)}
      accessibilityLabel="Molehunt molehills"
    >
      {size > 0 ? (
        <>
          <View style={[styles.grid, { width: size * COLUMNS + GAP * (COLUMNS - 1) }]}>
            {Array.from({ length: holes }, (_, i) => (
              <Molehill
                key={i}
                size={size}
                up={activeHoles.includes(i)}
                onPress={() => handleFound(i)}
              />
            ))}
          </View>
          <Progress found={found} total={moles} />
        </>
      ) : null}
    </View>
  );
}

// One molehill. When `up`, the mole rises and fades in; when it goes down
// (after being found) it gives a soft pulse first, then sinks. Empty
// molehills are disabled so a tap on them does nothing at all.
function Molehill({ size, up, onPress }) {
  const rise = useRef(new Animated.Value(up ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const wasUp = useRef(up);

  useEffect(() => {
    const sinking = wasUp.current && !up;
    wasUp.current = up;
    const move = Animated.timing(rise, {
      toValue: up ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    });
    if (sinking) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
        move,
      ]).start();
    } else {
      move.start();
    }
  }, [up, rise, scale]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [size * 0.25, 0] });

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!up}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={up ? 'Mole' : 'Molehill'}
      style={[styles.hill, { width: size, height: size }]}
    >
      <Animated.View style={{ opacity: rise, transform: [{ translateY }, { scale }] }}>
        <View style={[styles.mole, { width: size * 0.6, height: size * 0.6 }]}>
          <Ionicons name="happy-outline" size={size * 0.42} color={accent.icon} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// A row of dots that fill in as moles are found. It only counts up, so
// there's nothing to "run out" of.
function Progress({ found, total }) {
  return (
    <View style={styles.progress} accessible accessibilityLabel={`${found} of ${total} moles found`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < found && styles.dotFound]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  hill: {
    borderRadius: radii.circular,
    backgroundColor: earth.bg,
    borderWidth: 3,
    borderColor: earth.icon,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mole: {
    borderRadius: radii.circular,
    backgroundColor: accent.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flexDirection: 'row', gap: 12, marginTop: 28 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radii.circular,
    borderWidth: 3,
    borderColor: accent.icon,
  },
  dotFound: { backgroundColor: accent.icon },
});
