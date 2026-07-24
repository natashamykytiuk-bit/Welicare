import * as Crypto from 'expo-crypto';

// A PIN must be exactly 4 digits.
export function isValidPin(pin) {
  return /^\d{4}$/.test(pin);
}

// We never store the raw PIN — only its SHA-256 hash goes to Firestore
// (see users/{uid}.pinHash), so PINSetupScreen and PINEntryScreen can
// compare hashes without either of them keeping the plaintext PIN around.
export async function hashPin(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}
