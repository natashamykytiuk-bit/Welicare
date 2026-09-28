// @ts-check
// Memory Match — the rules of the game, with no React or screen code.
//
// Everything here is a plain function: give it data, get data back. That
// keeps the rules easy to test (tests/memoryMatchLogic.test.js) and lets
// the screen (screens/MemoryMatchScreen.js) focus only on drawing cards and
// animating them.
//
// The game: a deck of face-down cards made of matching pairs. The resident
// turns over two at a time; a matching pair stays face up, a non-matching
// pair turns back over. The round is finished when every pair is face up.
// There is no score, no move count and no way to lose.

/**
 * How many pairs each difficulty uses. Kept small: rounds should be short
 * and always finishable. The keys are what GameShell's difficulty picker
 * passes in.
 * @type {Record<'gentle' | 'medium' | 'challenge', number>}
 */
export const PAIRS_BY_DIFFICULTY = {
  gentle: 3, // 6 cards
  medium: 4, // 8 cards
  challenge: 6, // 12 cards
};

/**
 * The card faces: familiar, friendly pictures, each on its own soft
 * background. `icon` is an Ionicons name (the icon set the app already
 * uses — no emoji, which look different on every device). `accent` names
 * one of colors.activities in theme.js, which supplies the background and
 * icon colours; the rules don't need to know the colours themselves.
 * Six faces, enough for the largest (Challenge) round.
 */
export const CARD_FACES = [
  { faceId: 'flower', icon: 'flower-outline', label: 'flower', accent: 'music' },
  { faceId: 'sun', icon: 'sunny-outline', label: 'sun', accent: 'trivia' },
  { faceId: 'paw', icon: 'paw-outline', label: 'paw print', accent: 'meditation' },
  { faceId: 'heart', icon: 'heart-outline', label: 'heart', accent: 'conversation' },
  { faceId: 'cup', icon: 'cafe-outline', label: 'coffee cup', accent: 'photoAlbum' },
  { faceId: 'note', icon: 'musical-note-outline', label: 'musical note', accent: 'games' },
];

/**
 * @typedef {{ id: string, faceId: string, icon: string, label: string, accent: string }} Card
 * `id` is unique per card; `faceId` is shared by the two cards of a pair.
 */

/**
 * Returns a shuffled copy of `items` (Fisher–Yates), leaving the original
 * untouched. `random` can be swapped for a fixed sequence in tests.
 * @template T
 * @param {T[]} items
 * @param {() => number} [random]
 * @returns {T[]}
 */
export function shuffle(items, random = Math.random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds a new shuffled deck for a round: picks which faces to use, makes
 * two cards of each, and shuffles them. An unknown difficulty falls back to
 * Gentle rather than failing.
 * @param {string} difficulty 'gentle' | 'medium' | 'challenge'
 * @param {() => number} [random]
 * @returns {Card[]}
 */
export function buildDeck(difficulty, random = Math.random) {
  const pairs = PAIRS_BY_DIFFICULTY[difficulty] ?? PAIRS_BY_DIFFICULTY.gentle;
  // A different selection of pictures each round (only matters below
  // Challenge, which uses all six).
  const faces = shuffle(CARD_FACES, random).slice(0, pairs);
  const cards = faces.flatMap((face) => [
    { ...face, id: `${face.faceId}-a` },
    { ...face, id: `${face.faceId}-b` },
  ]);
  return shuffle(cards, random);
}

/**
 * True if two different cards show the same picture.
 * @param {Card} first
 * @param {Card} second
 */
export function isMatch(first, second) {
  return first.id !== second.id && first.faceId === second.faceId;
}

/**
 * True once every card in the deck has been matched.
 * @param {Card[]} cards
 * @param {Set<string>} matchedIds ids of cards already matched
 */
export function isRoundComplete(cards, matchedIds) {
  return cards.length > 0 && cards.every((card) => matchedIds.has(card.id));
}

/**
 * Whether a tap on `card` should turn it over. Taps are ignored while two
 * unmatched cards are showing (the short pause before they turn back), and
 * on cards that are already face up or matched — so extra or repeated taps
 * never do anything surprising.
 * @param {Card} card
 * @param {{ faceUpIds: string[], matchedIds: Set<string>, paused: boolean }} state
 */
export function canFlip(card, { faceUpIds, matchedIds, paused }) {
  return (
    !paused && faceUpIds.length < 2 && !faceUpIds.includes(card.id) && !matchedIds.has(card.id)
  );
}
