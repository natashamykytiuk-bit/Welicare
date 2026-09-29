// Molehunt artwork — the ONE place that says what each visual piece is.
//
// Today every entry is a placeholder drawn in code
// (components/games/molehunt/placeholders.js). When the illustrator's
// files arrive, put them in assets/games/molehunt/ (names in that folder's
// README) and replace the entry, e.g.
//
//   holeBack: require('../../assets/games/molehunt/hole-back.png'),
//
// Nothing else needs to change: the screen draws every piece through
// components/games/molehunt/Piece.js, which accepts either kind.
// moleBlink and sparkle are optional — set them to null and the game
// simply skips blinking / the sparkle.

import {
  FieldPlaceholder,
  HoleBackPlaceholder,
  HoleFrontPlaceholder,
  MoleBlinkPlaceholder,
  MoleHappyPlaceholder,
  MoleNormalPlaceholder,
  SparklePlaceholder,
} from '../../components/games/molehunt/placeholders';

export const MOLEHUNT_ASSETS = {
  field: FieldPlaceholder, // field.png — the whole play background
  holeBack: HoleBackPlaceholder, // hole-back.png — mound + dark opening
  holeFront: HoleFrontPlaceholder, // hole-front.png — the front lip
  moleNormal: MoleNormalPlaceholder, // mole-normal.png
  moleHappy: MoleHappyPlaceholder, // mole-happy.png — shown when tapped
  moleBlink: MoleBlinkPlaceholder, // mole-blink.png (optional, or null)
  sparkle: SparklePlaceholder, // sparkle.png (optional, or null)
};

// Where each piece sits inside one hole's slot, as fractions of the slot:
// left / width of the slot's width, top / height of its height (the slot
// is 0.95 as tall as it is wide — SLOT_ASPECT in layout.js). Art should be
// drawn at these proportions so it lines up. The mole's box is its "up"
// position; it slides down from there when hidden.
export const PIECE_BOXES = {
  holeBack: { left: 0, top: 0.52, width: 1, height: 0.48 },
  holeFront: { left: 0, top: 0.62, width: 1, height: 0.38 },
  mole: { left: 0.22, top: 0.19, width: 0.56, height: 0.6 },
  sparkle: { left: 0.64, top: 0.08, width: 0.24, height: 0.24 },
};

// The mole is clipped at this height (fraction of the slot): the middle
// of the hole's opening. Nothing of the mole ever draws below it; the
// front lip's top edge sits just above it and hides the cut.
export const MOLE_CLIP_BOTTOM = 0.7;
