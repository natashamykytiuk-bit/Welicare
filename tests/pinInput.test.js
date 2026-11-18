import { appendPinDigit, PIN_LENGTH } from '../hooks/usePinInput';

// The typing rules behind every PIN number pad (PINEntryScreen,
// PINSetupScreen, LockPinModal).
describe('appendPinDigit', () => {
  it('adds a digit to a partial PIN', () => {
    expect(appendPinDigit('12', '3', false)).toBe('123');
  });

  it('ignores taps once the PIN is full', () => {
    expect(appendPinDigit('1234', '5', false)).toBeNull();
  });

  it('ignores taps while disabled', () => {
    expect(appendPinDigit('1', '2', true)).toBeNull();
  });

  it('allows exactly PIN_LENGTH digits', () => {
    let digits = '';
    for (let i = 0; i < PIN_LENGTH + 2; i++) {
      digits = appendPinDigit(digits, '7', false) ?? digits;
    }
    expect(digits).toHaveLength(PIN_LENGTH);
  });
});
