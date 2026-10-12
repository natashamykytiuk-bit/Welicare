// Age screening for sign-up (COPPA: no accounts for children under 13).
//
// The sign-up form asks for a birth month and year in a neutral way — it
// never says which age is required, because a prompt like "confirm you are
// 13 or older" invites a child to simply pick the answer that works. The
// answer is only used for this check: it is never saved to Firestore or
// sent anywhere, so the app holds no date of birth for anyone.

export const MINIMUM_AGE = 13;

export const BIRTH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// A birth year is "plausible" if it is four digits and gives an age between
// 0 and 120. Anything else is treated as a typo (ask again), not as a child.
export function isPlausibleBirthYear(birthYear, now = new Date()) {
  if (!/^\d{4}$/.test(String(birthYear))) return false;
  const year = Number(birthYear);
  return year <= now.getFullYear() && year >= now.getFullYear() - 120;
}

// True once the person has definitely turned MINIMUM_AGE. Only the month is
// known, not the day, so someone whose birthday falls in the current month
// is counted as not there yet — the check errs towards refusing rather than
// letting a 12-year-old through a few days early.
export function isOldEnough(birthMonth, birthYear, now = new Date()) {
  const monthIndex = BIRTH_MONTHS.indexOf(birthMonth);
  if (monthIndex === -1 || !isPlausibleBirthYear(birthYear, now)) return false;
  const yearsSince = now.getFullYear() - Number(birthYear);
  if (yearsSince !== MINIMUM_AGE) return yearsSince > MINIMUM_AGE;
  return now.getMonth() > monthIndex;
}

// Once someone has been turned away, the form stays closed until the app is
// restarted — otherwise a child could just change the year and try again,
// which would make the question pointless. Kept in memory on purpose (not
// AsyncStorage) so an adult who mistyped isn't locked out of a shared
// facility tablet for good.
let turnedAway = false;

export function markTurnedAway() {
  turnedAway = true;
}

export function wasTurnedAway() {
  return turnedAway;
}

// Tests only: each test starts with a clean slate.
export function resetAgeGateForTests() {
  turnedAway = false;
}
