// @ts-check
// Molehunt — the rules of the game, with no React or screen code.
//
// Kept as plain functions (like games/memoryMatch/logic.js) so they are
// easy to test (tests/molehuntLogic.test.js) and the screen
// (screens/MolehuntScreen.js) only draws and animates.
//
// The game: a friendly mole peeks out of a molehill. When the resident taps
// it, it sinks and another pops up somewhere else. If it isn't tapped for
// a while (visibleMs, longest on Gentle), it ducks down and pops up in a
// different hole a moment later. That is not a "miss": nothing is counted
// or lost, no countdown is shown, and the round still ends only once the
// set number of moles has been found. Taps on empty molehills do nothing.
//
// Two settings shape a round, both picked by the caregiver in GameShell:
// - difficulty (Gentle / Medium / Challenge): how many molehills, how many
//   moles in the round, and how long each mole stays up (LEVELS);
// - the "Two moles at once" switch: two moles are up together instead of
//   one (molesUpAtOnce). It works with any difficulty.
// ("Keep playing" — rounds chaining without a break — is GameShell's, for
// every game.)

/**
 * Molehills, moles per round, and how long (ms) a mole stays up before
 * moving, for each difficulty. More holes means more to scan; less time
 * means quicker spotting. Gentle stays generous, as residents may need a
 * caregiver to point the mole out.
 * @type {Record<'gentle' | 'medium' | 'challenge', { holes: number, moles: number, visibleMs: number }>}
 */
export const LEVELS = {
  gentle: { holes: 3, moles: 8, visibleMs: 7000 }, // one row of 3
  medium: { holes: 6, moles: 12, visibleMs: 5000 }, // 3 × 2
  challenge: { holes: 9, moles: 16, visibleMs: 3500 }, // 3 × 3
};

/**
 * The settings for a difficulty; an unknown one falls back to Gentle
 * rather than failing.
 * @param {string} difficulty
 */
export function levelFor(difficulty) {
  return LEVELS[/** @type {keyof typeof LEVELS} */ (difficulty)] ?? LEVELS.gentle;
}

/**
 * How many moles are showing at the same time.
 * @param {boolean} twoMoles the caregiver's "Two moles at once" switch
 */
export function molesUpAtOnce(twoMoles) {
  return twoMoles ? 2 : 1;
}

/**
 * Picks the molehill for the next mole. `avoid` lists holes it must not
 * use: holes where a mole is already up, and the hole a mole was just
 * found in (so each new mole visibly appears somewhere new). Every allowed
 * hole is equally likely. If every hole is avoided (not possible with the
 * LEVELS above, but kept safe), it falls back to any hole without a mole
 * in `occupied`.
 * @param {number} holeCount
 * @param {number[]} avoid
 * @param {() => number} [random]
 * @param {number[]} [occupied] holes with a mole up right now
 * @returns {number} a hole index, 0 … holeCount - 1
 */
export function pickNextHole(holeCount, avoid, random = Math.random, occupied = []) {
  const all = Array.from({ length: holeCount }, (_, i) => i);
  let choices = all.filter((i) => !avoid.includes(i));
  if (choices.length === 0) choices = all.filter((i) => !occupied.includes(i));
  if (choices.length === 0) choices = all;
  return choices[Math.floor(random() * choices.length)];
}

/**
 * The holes for the moles that start a round: one, or two different ones.
 * @param {number} holeCount
 * @param {boolean} twoMoles
 * @param {() => number} [random]
 * @returns {number[]}
 */
export function startingHoles(holeCount, twoMoles, random = Math.random) {
  const holes = [];
  for (let i = 0; i < molesUpAtOnce(twoMoles); i++) {
    holes.push(pickNextHole(holeCount, holes, random));
  }
  return holes;
}

/**
 * Whether another mole should pop up after one is found: only while the
 * round still has moles that haven't appeared yet. (With two moles up, the
 * last one or two are found without new ones replacing them.)
 * @param {number} shown moles that have appeared so far this round
 * @param {string} difficulty
 */
export function shouldShowAnother(shown, difficulty) {
  return shown < levelFor(difficulty).moles;
}

/**
 * True once the resident has found every mole in the round.
 * @param {number} found
 * @param {string} difficulty
 */
export function isRoundComplete(found, difficulty) {
  return found >= levelFor(difficulty).moles;
}
