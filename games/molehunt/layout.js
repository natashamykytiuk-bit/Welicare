// @ts-check
// Molehunt — where each molehill sits on the field. Pure maths, no React,
// so it's unit-tested on its own (tests/molehuntLayout.test.js).
//
// The grid is still COLUMNS (3) wide with rows = ceil(holes / 3), but laid
// out like a real field seen from a little above:
// - Perspective: the back (top) row is drawn smaller and its band is
//   shallower, so back rows sit closer together; the front row is largest.
// - Natural placement: every hole is nudged a little off the straight grid.
//   The nudges come from a fixed seed per level (the hole count), so a
//   level always looks the same — the field doesn't jump between rounds.
// - Never overlapping, always fitting: each hole stays inside its own cell
//   (its column × its row band), and nudges are limited to the spare room
//   in that cell. Cells don't overlap, so holes can't either, and every
//   cell is inside the measured area, so the field never needs scrolling.

export const COLUMNS = 3;

// How much smaller the back row is than the front (front = 1).
const BACK_ROW_SCALE = 0.78;
// A hole slot's height relative to its width. The slot holds the whole
// molehill plus the room above it the mole rises into (see assets.js).
export const SLOT_ASPECT = 0.95;
// The largest a hole may be within its cell, leaving room around it.
const MAX_CELL_FILL = 0.82;
// How much of a cell's spare room nudges may use (the rest stays as a gap).
const NUDGE_SHARE = 0.6;

/**
 * A small repeatable pseudo-random generator (mulberry32). The same seed
 * always gives the same sequence, which is what keeps each level's layout
 * fixed.
 * @param {number} seed
 * @returns {() => number} numbers in [0, 1)
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {{ index: number, x: number, y: number, width: number, height: number, row: number }} HoleSlot
 * x / y are the slot's top-left corner inside the field area.
 */

/**
 * Lays out `holeCount` molehills inside a `width` × `height` area.
 * @param {number} holeCount
 * @param {number} width
 * @param {number} height
 * @returns {HoleSlot[]} in hole-index order (back row first, left to right)
 */
export function fieldLayout(holeCount, width, height) {
  if (holeCount <= 0 || width <= 0 || height <= 0) return [];
  const rows = Math.ceil(holeCount / COLUMNS);
  // Row scales from back to front, e.g. 0.78 → 0.89 → 1 for three rows.
  const scales = Array.from({ length: rows }, (_, r) =>
    rows === 1 ? 1 : BACK_ROW_SCALE + ((1 - BACK_ROW_SCALE) * r) / (rows - 1)
  );
  // Each row's band is as deep as its scale, so back bands are shallower.
  const totalScale = scales.reduce((sum, s) => sum + s, 0);
  const bandHeights = scales.map((s) => (height * s) / totalScale);
  const cellWidth = width / COLUMNS;

  // The front row's slot size, limited by both its cell width and its band
  // height; other rows are that size times their scale. Because every
  // band is proportional to its scale, a scaled slot fits its own band
  // exactly as well as the front one fits the front band.
  const frontWidth = Math.min(
    cellWidth * MAX_CELL_FILL,
    (bandHeights[rows - 1] * MAX_CELL_FILL) / SLOT_ASPECT
  );

  const random = seededRandom(holeCount * 7919);
  const slots = [];
  let bandTop = 0;
  for (let r = 0; r < rows; r++) {
    const slotWidth = frontWidth * scales[r];
    const slotHeight = slotWidth * SLOT_ASPECT;
    const inRow = Math.min(COLUMNS, holeCount - r * COLUMNS);
    // A short last row is centred rather than left-aligned.
    const rowOffset = ((COLUMNS - inRow) * cellWidth) / 2;
    for (let c = 0; c < inRow; c++) {
      const spareX = cellWidth - slotWidth;
      const spareY = bandHeights[r] - slotHeight;
      // A nudge between -½ and +½ of the allowed share of spare room.
      const nudgeX = (random() - 0.5) * spareX * NUDGE_SHARE;
      const nudgeY = (random() - 0.5) * spareY * NUDGE_SHARE;
      slots.push({
        index: r * COLUMNS + c,
        row: r,
        x: rowOffset + c * cellWidth + spareX / 2 + nudgeX,
        y: bandTop + spareY / 2 + nudgeY,
        width: slotWidth,
        height: slotHeight,
      });
    }
    bandTop += bandHeights[r];
  }
  return slots;
}
