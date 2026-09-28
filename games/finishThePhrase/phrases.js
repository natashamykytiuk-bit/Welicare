// @ts-check
// Familiar sayings, nursery rhymes and pairings for Finish the Phrase.
//
// Chosen because they live in long-term memory, which dementia usually
// spares longest, so most residents can finish them. Each phrase is split
// around the missing word: `before` + ___ + `after` (after is often empty).
//
// Every `answer` must be different from all the others: the wrong choices
// in a question are other phrases' answers, so a repeated answer could
// appear as a "wrong" button that is actually right.
// (tests/finishThePhraseLogic.test.js checks this.)

/** @typedef {{ before: string, answer: string, after: string }} Phrase */

/** @type {Phrase[]} */
export const PHRASES = [
  { before: 'An apple a day keeps the', answer: 'doctor', after: 'away' },
  { before: 'The early bird catches the', answer: 'worm', after: '' },
  { before: 'Every cloud has a silver', answer: 'lining', after: '' },
  { before: 'Twinkle, twinkle, little', answer: 'star', after: '' },
  { before: 'Better late than', answer: 'never', after: '' },
  { before: 'Actions speak louder than', answer: 'words', after: '' },
  { before: "Don't count your chickens before they", answer: 'hatch', after: '' },
  { before: 'Two peas in a', answer: 'pod', after: '' },
  { before: 'As busy as a', answer: 'bee', after: '' },
  { before: 'As quiet as a', answer: 'mouse', after: '' },
  { before: 'As good as', answer: 'gold', after: '' },
  { before: 'Happy', answer: 'birthday', after: 'to you' },
  { before: "Where there's a will, there's a", answer: 'way', after: '' },
  { before: 'Too many cooks spoil the', answer: 'broth', after: '' },
  { before: "Rome wasn't built in a", answer: 'day', after: '' },
  { before: 'Look before you', answer: 'leap', after: '' },
  { before: 'Birds of a feather flock', answer: 'together', after: '' },
  { before: 'Hickory, dickory,', answer: 'dock', after: '' },
  { before: 'Humpty Dumpty sat on a', answer: 'wall', after: '' },
  { before: 'Mary had a little', answer: 'lamb', after: '' },
  { before: 'A stitch in time saves', answer: 'nine', after: '' },
  { before: 'Slow and steady wins the', answer: 'race', after: '' },
  { before: "There's no place like", answer: 'home', after: '' },
  { before: 'The grass is always greener on the other', answer: 'side', after: '' },
  { before: "It's raining cats and", answer: 'dogs', after: '' },
  { before: 'Bread and', answer: 'butter', after: '' },
  { before: 'Salt and', answer: 'pepper', after: '' },
  { before: 'Fish and', answer: 'chips', after: '' },
  { before: 'Time for a nice cup of', answer: 'tea', after: '' },
  { before: 'Early to bed and early to', answer: 'rise', after: '' },
  { before: 'Easy come, easy', answer: 'go', after: '' },
  { before: 'Out of sight, out of', answer: 'mind', after: '' },
  { before: 'Practice makes', answer: 'perfect', after: '' },
  { before: "All's well that ends", answer: 'well', after: '' },
  { before: 'Laughter is the best', answer: 'medicine', after: '' },
  { before: 'Jack and Jill went up the', answer: 'hill', after: '' },
  { before: 'Row, row, row your', answer: 'boat', after: '' },
  { before: 'Rain, rain, go', answer: 'away', after: '' },
  { before: 'A friend in need is a friend', answer: 'indeed', after: '' },
  { before: 'Absence makes the heart grow', answer: 'fonder', after: '' },
];
