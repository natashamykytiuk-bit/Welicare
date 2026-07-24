import * as Crypto from 'expo-crypto';

export function isValidPin(pin) {
  return /^\d{4}$/.test(pin);
}

export async function hashPin(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}
