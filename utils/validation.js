export function isValidUsername(username) {
  return /^[a-zA-Z0-9._]+$/.test(username);
}

export function getPasswordRules(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    noSpaces: password.length > 0 && !/\s/.test(password),
  };
}

export function isPasswordValid(password) {
  return Object.values(getPasswordRules(password)).every(Boolean);
}
