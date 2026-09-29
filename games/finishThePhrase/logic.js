// @ts-check
// Finish the Phrase — the rules of the game, with no React or screen code.
//
// Plain functions like the other games' logic.js files, so they are easy
// to test (tests/finishThePhraseLogic.test.js); the screen
// (screens/WordGamesScreen.js) only draws and animates.
//
// The game: a familiar saying is shown with its last word missing, e.g.
// "An apple a day keeps the ___ away", with a few word buttons below. The
// right word completes the phrase. Any other word just quietly fades and
// can't be tapped again, so the resident always gets there in the end:
// no "wrong" message, no colour change, nothing lost.

import { shuffle } from '../memoryMatch/logic';
import { PHRASES } from './phrases';

/** @typedef {import('./phrases').Phrase} Phrase */
/** @typedef {{ phrase: Phrase, choices: string[] }} Question */

/**
 * Phrases per round for each difficulty — a few minutes each, Gentle the
 * shortest.
 * @type {Record<'gentle' | 'medium' | 'challenge', number>}
 */
export const PHRASES_BY_DIFFICULTY = {
  gentle: 6,
  medium: 8,
  challenge: 10,
};

/**
 * Phrases per round for a difficulty; unknown falls back to Gentle.
 * @param {string} difficulty
 */
export function phrasesPerRound(difficulty) {
  return (
    PHRASES_BY_DIFFICULTY[/** @type {keyof typeof PHRASES_BY_DIFFICULTY} */ (difficulty)] ??
    PHRASES_BY_DIFFICULTY.gentle
  );
}

/**
 * Word buttons per question (the answer plus the others) for each
 * difficulty. More choices means more reading, not a harder penalty.
 * @type {Record<'gentle' | 'medium' | 'challenge', number>}
 */
export const CHOICES_BY_DIFFICULTY = {
  gentle: 2,
  medium: 3,
  challenge: 4,
};

/**
 * Buttons per question for a difficulty; unknown falls back to Gentle.
 * @param {string} difficulty
 */
export function choiceCount(difficulty) {
  return (
    CHOICES_BY_DIFFICULTY[/** @type {keyof typeof CHOICES_BY_DIFFICULTY} */ (difficulty)] ??
    CHOICES_BY_DIFFICULTY.gentle
  );
}

/**
 * The word buttons for one phrase: its answer plus `count - 1` other
 * phrases' answers, in shuffled order (so the answer isn't always first).
 * @param {Phrase} phrase
 * @param {number} count
 * @param {() => number} [random]
 * @param {Phrase[]} [pool] where the other words come from
 * @returns {string[]}
 */
export function choicesFor(phrase, count, random = Math.random, pool = PHRASES) {
  const others = shuffle(
    pool.map((p) => p.answer).filter((word) => word !== phrase.answer),
    random
  ).slice(0, count - 1);
  return shuffle([phrase.answer, ...others], random);
}

/**
 * A new round: phrasesPerRound(difficulty) different phrases, each with
 * its buttons.
 * @param {string} difficulty
 * @param {() => number} [random]
 * @param {Phrase[]} [pool]
 * @returns {Question[]}
 */
export function buildRound(difficulty, random = Math.random, pool = PHRASES) {
  const count = choiceCount(difficulty);
  return shuffle(pool, random)
    .slice(0, phrasesPerRound(difficulty))
    .map((phrase) => ({ phrase, choices: choicesFor(phrase, count, random, pool) }));
}

/**
 * True if `word` finishes the phrase.
 * @param {Phrase} phrase
 * @param {string} word
 */
export function isCorrect(phrase, word) {
  return phrase.answer === word;
}

/**
 * True once every question in the round has been answered.
 * @param {number} answered
 * @param {Question[]} round
 */
export function isRoundComplete(answered, round) {
  return round.length > 0 && answered >= round.length;
}
