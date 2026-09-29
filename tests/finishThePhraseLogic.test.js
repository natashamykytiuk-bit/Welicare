// The pure Finish the Phrase rules and the phrase list they draw from.
import {
  PHRASES_BY_DIFFICULTY,
  phrasesPerRound,
  buildRound,
  choiceCount,
  choicesFor,
  isCorrect,
  isRoundComplete,
} from '../games/finishThePhrase/logic';
import { PHRASES } from '../games/finishThePhrase/phrases';

// A repeatable "random" sequence, so each test sees the same shuffles.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('PHRASES', () => {
  it('has enough phrases, each with a one-word answer', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(30);
    for (const p of PHRASES) {
      expect(p.before.length).toBeGreaterThan(0);
      expect(p.answer).toMatch(/^[a-z]+$/);
    }
  });

  it('never repeats an answer (a wrong choice must never be right)', () => {
    const answers = PHRASES.map((p) => p.answer);
    expect(new Set(answers).size).toBe(answers.length);
  });
});

describe('choiceCount', () => {
  it('gives 2, 3 or 4 buttons and falls back to Gentle', () => {
    expect(choiceCount('gentle')).toBe(2);
    expect(choiceCount('medium')).toBe(3);
    expect(choiceCount('challenge')).toBe(4);
    expect(choiceCount('unknown')).toBe(2);
  });
});

describe('choicesFor', () => {
  it('includes the answer once, with different other words', () => {
    const random = seeded(7);
    for (const phrase of PHRASES) {
      const choices = choicesFor(phrase, 4, random);
      expect(choices).toHaveLength(4);
      expect(choices.filter((w) => w === phrase.answer)).toHaveLength(1);
      expect(new Set(choices).size).toBe(4);
    }
  });

  it("doesn't always put the answer first", () => {
    const random = seeded(3);
    const positions = new Set(PHRASES.map((p) => choicesFor(p, 3, random).indexOf(p.answer)));
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('buildRound', () => {
  it('picks five different phrases with the right number of buttons', () => {
    const round = buildRound('medium', seeded(5));
    expect(round).toHaveLength(PHRASES_BY_DIFFICULTY.medium);
    expect(new Set(round.map((q) => q.phrase.answer)).size).toBe(PHRASES_BY_DIFFICULTY.medium);
    for (const q of round) {
      expect(q.choices).toHaveLength(3);
      expect(q.choices).toContain(q.phrase.answer);
    }
  });
});

describe('isCorrect / isRoundComplete', () => {
  it('checks the word and the end of the round', () => {
    const [phrase] = PHRASES;
    expect(isCorrect(phrase, phrase.answer)).toBe(true);
    expect(isCorrect(phrase, 'something else')).toBe(false);
    const round = buildRound('gentle', seeded(2));
    expect(isRoundComplete(5, round)).toBe(false);
    expect(isRoundComplete(6, round)).toBe(true);
    expect(isRoundComplete(0, [])).toBe(false);
  });
});

describe('phrasesPerRound', () => {
  it('grows with difficulty, Gentle the shortest, unknown falls back to Gentle', () => {
    expect(phrasesPerRound('gentle')).toBe(6);
    expect(phrasesPerRound('medium')).toBe(8);
    expect(phrasesPerRound('challenge')).toBe(10);
    expect(phrasesPerRound('unknown')).toBe(6);
  });
});
