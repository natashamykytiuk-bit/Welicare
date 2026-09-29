// The pure Molehunt rules: level sizes, where moles appear, the two-moles
// switch, and when a round is finished.
import {
  LEVELS,
  isRoundComplete,
  levelFor,
  molesUpAtOnce,
  pickNextHole,
  shouldShowAnother,
  startingHoles,
} from '../games/molehunt/logic';

// Every value 0, 0.01, … 0.99 — enough to reach every choice.
const sweep = Array.from({ length: 100 }, (_, i) => i / 100);

describe('levelFor', () => {
  it('returns each difficulty and falls back to Gentle', () => {
    expect(levelFor('gentle')).toMatchObject({ holes: 3, moles: 8 });
    expect(levelFor('medium')).toMatchObject({ holes: 6, moles: 12 });
    expect(levelFor('challenge')).toMatchObject({ holes: 9, moles: 16 });
    expect(levelFor('unknown')).toBe(LEVELS.gentle);
  });

  it('gives moles the longest time on Gentle and the shortest on Challenge', () => {
    const { gentle, medium, challenge } = LEVELS;
    expect(gentle.visibleMs).toBeGreaterThan(medium.visibleMs);
    expect(medium.visibleMs).toBeGreaterThan(challenge.visibleMs);
  });
});

describe('molesUpAtOnce', () => {
  it('is one normally and two with the switch on', () => {
    expect(molesUpAtOnce(false)).toBe(1);
    expect(molesUpAtOnce(true)).toBe(2);
  });
});

describe('pickNextHole', () => {
  it('can pick any hole when nothing is avoided', () => {
    const seen = new Set(sweep.map((r) => pickNextHole(3, [], () => r)));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('never picks an avoided hole, and reaches every other one', () => {
    const seen = new Set(sweep.map((r) => pickNextHole(9, [4, 7], () => r)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 5, 6, 8]);
  });

  it('with two moles on three holes, uses the one free hole', () => {
    // A mole is up in 0; one was just found in 2.
    for (const r of sweep) expect(pickNextHole(3, [0, 2], () => r)).toBe(1);
  });

  it('falls back to an unoccupied hole if everything is avoided', () => {
    expect(pickNextHole(2, [0, 1], () => 0, [1])).toBe(0);
    expect(pickNextHole(1, [0])).toBe(0);
  });
});

describe('startingHoles', () => {
  it('starts one mole normally', () => {
    expect(startingHoles(3, false, () => 0.5)).toHaveLength(1);
  });

  it('starts two moles in different holes with the switch on', () => {
    for (const r of sweep) {
      const [a, b] = startingHoles(3, true, () => r);
      expect(a).not.toBe(b);
    }
  });
});

describe('shouldShowAnother / isRoundComplete', () => {
  it('stops new moles once all have appeared', () => {
    expect(shouldShowAnother(7, 'gentle')).toBe(true);
    expect(shouldShowAnother(8, 'gentle')).toBe(false);
  });

  it('is complete once every mole is found', () => {
    expect(isRoundComplete(7, 'gentle')).toBe(false);
    expect(isRoundComplete(8, 'gentle')).toBe(true);
    expect(isRoundComplete(16, 'challenge')).toBe(true);
  });
});
