import { Image } from 'react-native';

// Draws one Molehunt art piece from games/molehunt/assets.js into a box of
// the given size. An asset entry can be either:
// - a placeholder component (a function) — rendered with { width, height };
// - an image source — what require('…png') returns (a number) or a
//   { uri } object — rendered as an Image stretched to the box.
// That's the only place the two kinds are told apart, which is why
// swapping a placeholder for a PNG in assets.js needs no other change.
// A missing entry (null, e.g. no blink artwork) draws nothing.
export default function Piece({ source, width, height, style }) {
  if (!source) return null;
  if (typeof source === 'function') {
    const Placeholder = source;
    return <Placeholder width={width} height={height} style={style} />;
  }
  // 'stretch' so the art fills exactly the box the layout reserves for it;
  // the README asks for art drawn at the box's proportions, so nothing is
  // visibly distorted.
  return <Image source={source} style={[{ width, height }, style]} resizeMode="stretch" />;
}
