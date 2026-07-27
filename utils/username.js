// The lookup key used in the usernames/{key} collection — always the
// trimmed, lowercased form, so "Jane.Doe" and "jane.doe " resolve to the
// same document regardless of how any given screen collected the input.
export function normalizeUsername(username) {
  return username.trim().toLowerCase();
}
