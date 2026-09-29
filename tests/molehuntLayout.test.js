// The Molehunt field layout: fits, never overlaps, has perspective, and
// stays the same for a level from round to round.
import { LEVELS } from '../games/molehunt/logic';
import { fieldLayout, seededRandom } from '../games/molehunt/layout';

// Roughly the play area on a landscape iPad (and a smaller one), once the
// header and progress dots are taken off.
const AREAS = [
  [968, 560],
  [1300, 800],
  [700, 420],
];

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('fieldLayout', () => {
  for (const [level, { holes }] of Object.entries(LEVELS)) {
    for (const [w, h] of AREAS) {
      it(`${level}: ${holes} holes fit ${w}×${h} without overlapping`, () => {
        const slots = fieldLayout(holes, w, h);
        expect(slots).toHaveLength(holes);
        for (const s of slots) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.x + s.width).toBeLessThanOrEqual(w);
          expect(s.y + s.height).toBeLessThanOrEqual(h);
        }
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            expect(overlaps(slots[i], slots[j])).toBe(false);
          }
        }
      });
    }
  }

  it('draws back rows smaller than front rows', () => {
    const slots = fieldLayout(9, 968, 560);
    const widthOfRow = (r) => slots.find((s) => s.row === r).width;
    expect(widthOfRow(0)).toBeLessThan(widthOfRow(1));
    expect(widthOfRow(1)).toBeLessThan(widthOfRow(2));
  });

  it("isn't a perfectly straight grid", () => {
    const row = fieldLayout(9, 968, 560).filter((s) => s.row === 1);
    expect(new Set(row.map((s) => Math.round(s.y))).size).toBeGreaterThan(1);
  });

  it('gives the same layout every round for a level', () => {
    expect(fieldLayout(6, 968, 560)).toEqual(fieldLayout(6, 968, 560));
  });

  it('handles an empty area', () => {
    expect(fieldLayout(3, 0, 0)).toEqual([]);
  });
});

describe('seededRandom', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
