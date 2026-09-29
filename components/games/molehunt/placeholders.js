import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../../../theme';

// Stand-in artwork for Molehunt, drawn with plain Views, until the
// illustrator's PNGs arrive. Each one is listed in games/molehunt/assets.js
// and can be replaced there by an image without touching the game.
//
// Every placeholder receives the { width, height } of the box assets.js
// gives its piece (see PIECE_BOXES) and draws only inside that box, using
// fractions of it — exactly how a PNG would fill the same box.

const m = colors.molehunt;

// The whole play background: a pale sky band along the top, a soft
// horizon, then grass down to the bottom.
export function FieldPlaceholder({ width, height }) {
  return (
    <View style={{ width, height, backgroundColor: m.grass }}>
      <View style={[styles.band, { height: height * 0.14, backgroundColor: m.sky }]} />
      <View style={[styles.band, { height: height * 0.06, backgroundColor: m.horizon }]} />
      {/* A slightly darker lower field, for a little depth. */}
      <View
        style={[
          styles.band,
          { position: 'absolute', bottom: 0, height: height * 0.35, backgroundColor: m.grassDark },
        ]}
      />
    </View>
  );
}

// Back of the hole: the clay mound and the dark opening in it.
export function HoleBackPlaceholder({ width, height }) {
  return (
    <View style={{ width, height }}>
      <View
        style={[
          styles.ellipse,
          { left: 0, top: height * 0.1, width, height: height * 0.9, backgroundColor: m.clay },
        ]}
      />
      <View
        style={[
          styles.ellipse,
          {
            left: width * 0.19,
            top: height * 0.17,
            width: width * 0.62,
            height: height * 0.42,
            backgroundColor: m.holeDark,
          },
        ]}
      />
    </View>
  );
}

// Front lip of the hole: a clay rim drawn over the lower edge of the
// opening. It also hides the line where the mole is clipped (see the
// layer notes in screens/MolehuntScreen.js).
export function HoleFrontPlaceholder({ width, height }) {
  return (
    <View style={{ width, height }}>
      <View
        style={{
          position: 'absolute',
          left: width * 0.12,
          top: height * 0.16,
          width: width * 0.76,
          height: height * 0.42,
          borderRadius: radii.circular,
          backgroundColor: m.clay,
          borderTopWidth: Math.max(2, height * 0.04),
          borderColor: m.clayDark,
        }}
      />
    </View>
  );
}

// The mole: a rounded warm-brown body, a light muzzle, two eyes and a
// small smile. `pose` changes only the face.
function MoleFace({ width, height, pose }) {
  const eye = width * 0.12;
  const eyeTop = height * 0.28;
  const eyeStyle = (left) => {
    if (pose === 'happy') {
      // Closed, smiling "^" eyes: the top half of a ring.
      return {
        position: 'absolute',
        left,
        top: eyeTop,
        width: eye,
        height: eye / 2,
        borderTopLeftRadius: eye,
        borderTopRightRadius: eye,
        borderWidth: Math.max(2, eye * 0.25),
        borderBottomWidth: 0,
        borderColor: m.moleFeature,
      };
    }
    if (pose === 'blink') {
      return {
        position: 'absolute',
        left,
        top: eyeTop + eye / 2,
        width: eye,
        height: Math.max(2, eye * 0.2),
        borderRadius: radii.circular,
        backgroundColor: m.moleFeature,
      };
    }
    return {
      position: 'absolute',
      left,
      top: eyeTop,
      width: eye,
      height: eye,
      borderRadius: radii.circular,
      backgroundColor: m.moleFeature,
    };
  };
  const smileWidth = width * (pose === 'happy' ? 0.3 : 0.2);
  return (
    <View style={{ width, height }}>
      <View
        style={{
          width,
          height,
          backgroundColor: m.moleFur,
          borderTopLeftRadius: width / 2,
          borderTopRightRadius: width / 2,
          borderBottomLeftRadius: width * 0.2,
          borderBottomRightRadius: width * 0.2,
        }}
      />
      <View
        style={[
          styles.ellipse,
          {
            left: width * 0.2,
            top: height * 0.4,
            width: width * 0.6,
            height: height * 0.36,
            backgroundColor: m.moleMuzzle,
          },
        ]}
      />
      <View style={eyeStyle(width * 0.26)} />
      <View style={eyeStyle(width * 0.62)} />
      {/* Nose */}
      <View
        style={[
          styles.ellipse,
          {
            left: width * 0.43,
            top: height * 0.45,
            width: width * 0.14,
            height: width * 0.09,
            backgroundColor: m.moleFeature,
          },
        ]}
      />
      {/* Smile: the bottom half of a ring. */}
      <View
        style={{
          position: 'absolute',
          left: (width - smileWidth) / 2,
          top: height * 0.56,
          width: smileWidth,
          height: smileWidth / 2,
          borderBottomLeftRadius: smileWidth,
          borderBottomRightRadius: smileWidth,
          borderWidth: Math.max(2, width * 0.03),
          borderTopWidth: 0,
          borderColor: m.moleFeature,
        }}
      />
    </View>
  );
}

export const MoleNormalPlaceholder = (props) => <MoleFace {...props} pose="normal" />;
export const MoleHappyPlaceholder = (props) => <MoleFace {...props} pose="happy" />;
export const MoleBlinkPlaceholder = (props) => <MoleFace {...props} pose="blink" />;

// A soft four-pointed twinkle: two slim rounded bars crossed.
export function SparklePlaceholder({ width, height }) {
  const bar = {
    position: 'absolute',
    left: width * 0.44,
    top: 0,
    width: width * 0.12,
    height,
    borderRadius: radii.circular,
    backgroundColor: m.sparkle,
  };
  return (
    <View style={{ width, height }}>
      <View style={bar} />
      <View style={[bar, { transform: [{ rotate: '90deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: { width: '100%' },
  ellipse: { position: 'absolute', borderRadius: radii.circular },
});
