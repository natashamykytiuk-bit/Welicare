// Tests for the sign-up age screen (utils/ageGate.js).
//
// What each test pins down:
// - Under-13s are refused, and a birthday in the current month counts as
//   "not yet" because the day isn't known.
// - A mistyped year is a typo to correct, never a pass.
// - Being turned away sticks until it is reset (an app restart).

import {
  isOldEnough,
  isPlausibleBirthYear,
  markTurnedAway,
  resetAgeGateForTests,
  wasTurnedAway,
} from '../utils/ageGate';

// 12 October 2026 — month index 9.
const NOW = new Date(2026, 9, 12);

describe('isOldEnough', () => {
  it('accepts an adult', () => {
    expect(isOldEnough('March', '1980', NOW)).toBe(true);
  });

  it('refuses a child under 13', () => {
    expect(isOldEnough('March', '2016', NOW)).toBe(false);
  });

  it('accepts someone who turned 13 in an earlier month this year', () => {
    expect(isOldEnough('September', '2013', NOW)).toBe(true);
  });

  it('refuses a 13th birthday in the current month or later this year', () => {
    expect(isOldEnough('October', '2013', NOW)).toBe(false);
    expect(isOldEnough('November', '2013', NOW)).toBe(false);
  });

  it('refuses a missing month or an implausible year', () => {
    expect(isOldEnough('', '1980', NOW)).toBe(false);
    expect(isOldEnough('March', '80', NOW)).toBe(false);
  });
});

describe('isPlausibleBirthYear', () => {
  it('needs four digits within the last 120 years', () => {
    expect(isPlausibleBirthYear('1950', NOW)).toBe(true);
    expect(isPlausibleBirthYear('195', NOW)).toBe(false);
    expect(isPlausibleBirthYear('1850', NOW)).toBe(false);
    expect(isPlausibleBirthYear('2030', NOW)).toBe(false);
  });
});

describe('turned away', () => {
  it('sticks until reset', () => {
    resetAgeGateForTests();
    expect(wasTurnedAway()).toBe(false);
    markTurnedAway();
    expect(wasTurnedAway()).toBe(true);
    resetAgeGateForTests();
    expect(wasTurnedAway()).toBe(false);
  });
});
