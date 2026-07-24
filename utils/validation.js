// Username may only contain letters, numbers, periods, and underscores.
export function isValidUsername(username) {
  return /^[a-zA-Z0-9._]+$/.test(username);
}

// Checks a password against each individual rule so the UI can show
// which requirements are met vs. still missing (see PASSWORD_RULE_LABELS
// in SignUpScreen.js).
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

// A password is valid only once every rule above passes.
export function isPasswordValid(password) {
  return Object.values(getPasswordRules(password)).every(Boolean);
}
