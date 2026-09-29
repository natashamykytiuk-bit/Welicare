// Molehunt artwork config and the Piece renderer: every assets.js entry
// must be something Piece can draw, and Piece must draw both kinds — a
// placeholder component today, a require()'d PNG later — so swapping one
// for the other needs no other change.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import Piece from '../components/games/molehunt/Piece';
import { MOLEHUNT_ASSETS, PIECE_BOXES } from '../games/molehunt/assets';

describe('MOLEHUNT_ASSETS', () => {
  it('has every piece, as a component, an image source or (optional ones) null', () => {
    const required = ['field', 'holeBack', 'holeFront', 'moleNormal', 'moleHappy'];
    for (const key of required) expect(MOLEHUNT_ASSETS[key]).toBeTruthy();
    for (const [key, value] of Object.entries(MOLEHUNT_ASSETS)) {
      const ok =
        typeof value === 'function' ||
        typeof value === 'number' ||
        (value && typeof value === 'object' && 'uri' in value) ||
        (value === null && ['moleBlink', 'sparkle'].includes(key));
      expect({ key, ok }).toEqual({ key, ok: true });
    }
  });

  it('keeps every piece box inside the hole slot', () => {
    for (const box of Object.values(PIECE_BOXES)) {
      expect(box.left + box.width).toBeLessThanOrEqual(1);
      expect(box.top + box.height).toBeLessThanOrEqual(1);
    }
  });
});

describe('Piece', () => {
  it('draws a placeholder component at the given size', async () => {
    const Placeholder = ({ width, height }) => <Text>{`${width}x${height}`}</Text>;
    await render(<Piece source={Placeholder} width={120} height={80} />);
    expect(screen.getByText('120x80')).toBeTruthy();
  });

  it('draws an image source (what require() returns) as an Image', async () => {
    const { toJSON } = await render(<Piece source={42} width={120} height={80} />);
    const json = toJSON();
    expect(json.type).toBe('Image');
    expect(json.props.style).toEqual(expect.arrayContaining([{ width: 120, height: 80 }]));
  });

  it('draws nothing for a missing optional piece', async () => {
    const { toJSON } = await render(<Piece source={null} width={10} height={10} />);
    expect(toJSON()).toBeNull();
  });
});
