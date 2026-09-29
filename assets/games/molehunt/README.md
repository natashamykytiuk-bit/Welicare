# Molehunt artwork

Drop the illustrator's files here, then point the matching entry in
`games/molehunt/assets.js` at the file, for example
`holeBack: require('../../assets/games/molehunt/hole-back.png')`.
No other code needs to change.

Expected files (PNG with transparency, @2x or larger):

| File | Piece | Notes |
|---|---|---|
| `field.png` | Background | Grass with a light sky band along the top; fills the whole screen |
| `hole-back.png` | Hole back | Clay mound and the dark opening |
| `hole-front.png` | Hole front lip | The front edge of the opening, drawn over the mole |
| `mole-normal.png` | Mole | Friendly, looking out |
| `mole-happy.png` | Mole, tapped | Happy pose |
| `mole-blink.png` | Mole blinking | Optional |
| `sparkle.png` | Sparkle on tap | Optional |

Box proportions for each piece are in `PIECE_BOXES` in `games/molehunt/assets.js`.
Draw each piece at those proportions so the layers line up.
