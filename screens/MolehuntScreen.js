import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import GameShell from '../components/games/GameShell';
import gentleHaptic from '../components/games/gentleHaptic';
import Piece from '../components/games/molehunt/Piece';
import ProgressDots from '../components/games/ProgressDots';
import { MOLEHUNT_ASSETS, MOLE_CLIP_BOTTOM, PIECE_BOXES } from '../games/molehunt/assets';
import { fieldLayout } from '../games/molehunt/layout';
import {
  isRoundComplete,
  levelFor,
  pickNextHole,
  shouldShowAnother,
  startingHoles,
} from '../games/molehunt/logic';

// A calm beat between a mole sinking (found, or moving on) and the next
// one peeking out.
const NEXT_MOLE_DELAY_MS = 600;
// Lets the last mole's happy pulse be seen before the completion message.
const COMPLETE_DELAY_MS = 1100;
// Height kept below the field for the progress dots.
// Room for up to two rows of dots (16 moles wrap on a phone).
const PROGRESS_SPACE = 100;
// Blinking (only if assets.js provides moleBlink): a blink lasts this long,
// and comes every 2.5–4.5 seconds while a mole is up.
const BLINK_MS = 150;
const BLINK_EVERY_MS = [2500, 4500];

const art = MOLEHUNT_ASSETS;

// Resident Mode → Games → Molehunt. GameShell supplies the header,
// difficulty picker, the "Two moles at once" switch, the completion view
// and play-time logging; this screen draws the field and plays one round.
export default function MolehuntScreen({ navigation, route }) {
  return (
    <GameShell
      navigation={navigation}
      route={route}
      activityId="molehunt"
      title="Molehunt"
      description="A friendly mole is peeking out. Tap it when you spot it!"
      completionMessage="Wonderful! You found all the moles."
      // "Keep playing" comes from GameShell, for every game.
      switches={[{ key: 'twoMoles', label: 'Two moles at once' }]}
      playBackground={<FieldBackground />}
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

// The field art, stretched over the whole screen behind the header and the
// holes (GameShell's playBackground slot). Measures itself so the art gets
// a real size, as an image would need.
function FieldBackground() {
  const [size, setSize] = useState(null);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {size ? <Piece source={art.field} width={size.width} height={size.height} /> : null}
    </View>
  );
}

// One round. `activeHoles` are the holes with a mole up (one, or two with
// the switch on); `found` only ever counts up.
//
// Every mole that appears (showMole) gets its own hide timer of the level's
// visibleMs:
// - tapped in time: light haptic, the mole turns happy, pulses and sinks,
//   `found` goes up, and, if the round still has moles to come
//   (shouldShowAnother), after NEXT_MOLE_DELAY_MS a new one appears
//   elsewhere.
// - not tapped: it quietly sinks and, after the same short beat, pops up
//   in a different hole. Nothing is counted: it's the same mole moving,
//   so the round can't be lost, only take a little longer.
// Taps on empty molehills are ignored: there is no "miss".
//
// The round's counters live in refs as well as state because the delayed
// callbacks run later, when the state they closed over may be stale (e.g.
// the other mole was found in the meantime).
export function MolehuntBoard({ difficulty, twoMoles, onComplete }) {
  const { holes, moles, visibleMs } = levelFor(difficulty);
  const [startHoles] = useState(() => startingHoles(holes, twoMoles));
  const [activeHoles, setActiveHoles] = useState([]);
  const [found, setFound] = useState(0);
  const [area, setArea] = useState(null);
  const active = useRef([]);
  const foundCount = useRef(0);
  const shown = useRef(startHoles.length);
  // Each showing mole's hide timer, by hole, so finding it can cancel it.
  const hideTimers = useRef(new Map());

  // Pending timers, cleared if the resident leaves mid-round.
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };

  function updateActive(next) {
    active.current = next;
    setActiveHoles(next);
  }

  // A new mole in a hole that's neither occupied nor the one just emptied.
  function showMoleAwayFrom(emptied) {
    showMole(pickNextHole(holes, [...active.current, emptied], Math.random, active.current));
  }

  // Puts a mole up in `hole` and starts its hide timer.
  function showMole(hole) {
    updateActive([...active.current, hole]);
    hideTimers.current.set(
      hole,
      later(() => {
        hideTimers.current.delete(hole);
        updateActive(active.current.filter((h) => h !== hole));
        // The same mole reappears somewhere else (never the hole it left).
        later(() => showMoleAwayFrom(hole), NEXT_MOLE_DELAY_MS);
      }, visibleMs)
    );
  }

  // The round's first mole(s), shown once the board mounts.
  useEffect(() => {
    startHoles.forEach(showMole);
    // Runs once per round; GameShell remounts the board for a new round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFound(hole) {
    if (!active.current.includes(hole)) return; // already found or hidden
    clearTimeout(hideTimers.current.get(hole));
    hideTimers.current.delete(hole);
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
    later(() => showMoleAwayFrom(hole), NEXT_MOLE_DELAY_MS);
  }

  // Where each hole goes on the field: perspective rows with small fixed
  // nudges (games/molehunt/layout.js), sized to the measured area minus
  // room for the progress dots, so every level fits without scrolling.
  const slots = area ? fieldLayout(holes, area.width, area.height - PROGRESS_SPACE) : [];

  return (
    <View
      style={styles.area}
      onLayout={(e) => setArea(e.nativeEvent.layout)}
      accessibilityLabel="Molehunt molehills"
    >
      {slots.map((slot) => (
        <Molehill
          key={slot.index}
          slot={slot}
          up={activeHoles.includes(slot.index)}
          onPress={() => handleFound(slot.index)}
        />
      ))}
      {area ? (
        <View style={styles.progress}>
          <ProgressDots done={found} total={moles} label={`${found} of ${moles} moles found`} />
        </View>
      ) : null}
    </View>
  );
}

// Places a piece's box (fractions from PIECE_BOXES) inside a slot.
function boxIn(slot, box) {
  return {
    position: 'absolute',
    left: box.left * slot.width,
    top: box.top * slot.height,
    width: box.width * slot.width,
    height: box.height * slot.height,
  };
}

// One molehill, drawn as stacked layers, back to front:
//
//   1. hole back   — the clay mound and the dark opening
//   2. mole        — inside a clipping window (see below)
//   3. sparkle     — a brief twinkle when the mole is found
//   4. hole front  — the front lip of the opening, over the mole
//
// Clipping: the mole sits in a window (overflow: 'hidden') that covers the
// slot from its top down to MOLE_CLIP_BOTTOM, the middle of the opening.
// Anything of the mole below that line is cut off, so it can never show
// below the lip, whatever the art or the animation does. "Down" moves the
// mole entirely below that line (hidden); "up" moves it back into view.
// The front lip is drawn last with its top edge just above the clip line,
// so the straight cut is always covered by the rim.
//
// The whole slot is the tap target (a forgiving area much larger than the
// visible mole). It's disabled while no mole is up, so a tap on an empty
// hole does nothing at all.
function Molehill({ slot, up, onPress }) {
  const moleBox = boxIn(slot, PIECE_BOXES.mole);
  const clipHeight = MOLE_CLIP_BOTTOM * slot.height;
  // How far down the mole must move to be completely below the clip line.
  const hiddenOffset = clipHeight - moleBox.top + 2;

  // 0 = down (hidden), 1 = up. Values a little over 1 lift it slightly
  // higher, which is the small bounce at the top of the rise.
  const rise = useRef(new Animated.Value(up ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const [pose, setPose] = useState('normal');
  const wasUp = useRef(up);
  // Set by a tap, so the next "going down" knows it was a find.
  const tapped = useRef(false);

  useEffect(() => {
    const goingUp = up && !wasUp.current;
    const goingDown = !up && wasUp.current;
    const wasFound = tapped.current;
    wasUp.current = up;
    tapped.current = false;

    const sink = Animated.timing(rise, {
      toValue: 0,
      duration: 340,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    if (goingUp) {
      setPose('normal');
      // Soft ease-out rise, a tiny overshoot, then settle: the bounce.
      Animated.sequence([
        Animated.timing(rise, {
          toValue: 1.06,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(rise, {
          toValue: 1,
          duration: 160,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (goingDown && wasFound) {
      // Found: happy pose, a gentle pulse and sparkle together, then sink.
      setPose('happy');
      Animated.sequence([
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.1, duration: 180, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(sparkle, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(sparkle, { toValue: 0, duration: 320, useNativeDriver: true }),
          ]),
        ]),
        sink,
      ]).start(() => setPose('normal'));
    } else if (goingDown) {
      // Moving on untapped: just sink quietly, no celebration.
      sink.start();
    }
  }, [up, rise, scale, sparkle]);

  // Occasional blinks while up, only when blink art exists.
  useEffect(() => {
    if (!up || !art.moleBlink) return undefined;
    let timer;
    const scheduleBlink = () => {
      const [min, max] = BLINK_EVERY_MS;
      timer = setTimeout(
        () => {
          setPose((p) => (p === 'normal' ? 'blink' : p));
          timer = setTimeout(() => {
            setPose((p) => (p === 'blink' ? 'normal' : p));
            scheduleBlink();
          }, BLINK_MS);
        },
        min + Math.random() * (max - min)
      );
    };
    scheduleBlink();
    return () => clearTimeout(timer);
  }, [up]);

  const translateY = rise.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenOffset, 0],
    extrapolate: 'extend',
  });
  const moleArt =
    pose === 'happy' ? art.moleHappy : pose === 'blink' ? art.moleBlink : art.moleNormal;
  const holeBack = boxIn(slot, PIECE_BOXES.holeBack);
  const holeFront = boxIn(slot, PIECE_BOXES.holeFront);
  const sparkleBox = boxIn(slot, PIECE_BOXES.sparkle);

  return (
    <Pressable
      onPress={() => {
        tapped.current = true;
        onPress();
      }}
      disabled={!up}
      accessibilityRole="button"
      accessibilityLabel={up ? 'Mole' : 'Molehill'}
      style={[styles.slot, { left: slot.x, top: slot.y, width: slot.width, height: slot.height }]}
    >
      {/* 1. Hole back */}
      <View style={holeBack} pointerEvents="none">
        <Piece source={art.holeBack} width={holeBack.width} height={holeBack.height} />
      </View>

      {/* 2. Mole, in its clipping window */}
      <View style={[styles.clip, { height: clipHeight }]} pointerEvents="none">
        <Animated.View style={[moleBox, { transform: [{ translateY }, { scale }] }]}>
          <Piece source={moleArt ?? art.moleNormal} width={moleBox.width} height={moleBox.height} />
        </Animated.View>
      </View>

      {/* 3. Sparkle (optional art) */}
      {art.sparkle ? (
        <Animated.View style={[sparkleBox, { opacity: sparkle }]} pointerEvents="none">
          <Piece source={art.sparkle} width={sparkleBox.width} height={sparkleBox.height} />
        </Animated.View>
      ) : null}

      {/* 4. Hole front lip, over the mole */}
      <View style={holeFront} pointerEvents="none">
        <Piece source={art.holeFront} width={holeFront.width} height={holeFront.height} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1 },
  slot: { position: 'absolute' },
  clip: { position: 'absolute', left: 0, top: 0, right: 0, overflow: 'hidden' },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PROGRESS_SPACE },
});
