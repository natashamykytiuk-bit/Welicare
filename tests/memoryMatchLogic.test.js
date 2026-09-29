// Tests for Memory Match's rules (games/memoryMatch/logic.js). Pure
// functions, so no screens or Firebase — just data in, data out.
import {
  CARD_FACES,
  PAIRS_BY_DIFFICULTY,
  buildDeck,
  canFlip,
  isMatch,
  isRoundComplete,
  shuffle,
} from '../games/memoryMatch/logic';

describe('buildDeck', () => {
  it.each([
    ['gentle', 8],
    ['medium', 12],
    ['challenge', 16],
  ])('%s makes %i cards, two of each picture', (difficulty, count) => {
    const deck = buildDeck(difficulty);
    expect(deck).toHaveLength(count);
    const perFace = {};
    for (const card of deck) perFace[card.faceId] = (perFace[card.faceId] ?? 0) + 1;
    expect(Object.values(perFace).every((n) => n === 2)).toBe(true);
    // Every card id is unique.
    expect(new Set(deck.map((c) => c.id)).size).toBe(count);
  });

  it('falls back to Gentle for an unknown difficulty', () => {
    expect(buildDeck('unknown')).toHaveLength(PAIRS_BY_DIFFICULTY.gentle * 2);
  });

  it('has enough distinct faces for the largest round, each with its own colour', () => {
    expect(CARD_FACES.length).toBeGreaterThanOrEqual(PAIRS_BY_DIFFICULTY.challenge);
    // Every face has its own picture (colours may repeat — there are only
    // seven activity colours).
    expect(new Set(CARD_FACES.map((f) => f.icon)).size).toBe(CARD_FACES.length);
    expect(new Set(CARD_FACES.map((f) => f.faceId)).size).toBe(CARD_FACES.length);
  });
});

describe('shuffle', () => {
  it('keeps every item and leaves the original alone', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items, () => 0);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(result.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isMatch / isRoundComplete', () => {
  const [a1, a2, b1] = [
    { id: 'sun-a', faceId: 'sun' },
    { id: 'sun-b', faceId: 'sun' },
    { id: 'paw-a', faceId: 'paw' },
  ];

  it('matches two different cards with the same picture only', () => {
    expect(isMatch(a1, a2)).toBe(true);
    expect(isMatch(a1, b1)).toBe(false);
    expect(isMatch(a1, a1)).toBe(false); // the same card twice isn't a pair
  });

  it('is complete only when every card is matched', () => {
    const deck = [a1, a2];
    expect(isRoundComplete(deck, new Set(['sun-a']))).toBe(false);
    expect(isRoundComplete(deck, new Set(['sun-a', 'sun-b']))).toBe(true);
    expect(isRoundComplete([], new Set())).toBe(false);
  });
});

describe('canFlip', () => {
  const card = { id: 'sun-a', faceId: 'sun' };
  const base = { faceUpIds: [], matchedIds: new Set(), paused: false };

  it('allows a face-down card when nothing is in the way', () => {
    expect(canFlip(card, base)).toBe(true);
  });

  it('ignores taps during the pause, on showing or matched cards, or with two up', () => {
    expect(canFlip(card, { ...base, paused: true })).toBe(false);
    expect(canFlip(card, { ...base, faceUpIds: ['sun-a'] })).toBe(false);
    expect(canFlip(card, { ...base, matchedIds: new Set(['sun-a']) })).toBe(false);
    expect(canFlip(card, { ...base, faceUpIds: ['x', 'y'] })).toBe(false);
  });
});
