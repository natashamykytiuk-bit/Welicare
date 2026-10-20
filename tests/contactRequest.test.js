// Tests for the Contact form's server-side checks (functions/contactRequest.js).
//
// What each test pins down:
// - validateContactRequest accepts exactly what the form sends, trimmed,
//   and refuses anything missing, too long, the wrong type or an unknown
//   role. These are the checks firestore.rules used to make before the form
//   moved to a Cloud Function.
// - Extra fields never reach Firestore: only the known ones are returned.
// - clientKey groups requests by the caller's IP (the first
//   X-Forwarded-For entry) without exposing the address itself.

import { clientKey, validateContactRequest } from '../functions/contactRequest';

/** A valid submission, as ContactPage.tsx sends it. Details are made up. */
function submission(overrides = {}) {
  return {
    name: 'Pat Example',
    email: 'pat@example.com',
    organization: 'Maple Grove Care',
    role: 'Care home administrator',
    message: 'We’d like to hear more about a pilot.',
    wantsPilot: true,
    ...overrides,
  };
}

describe('validateContactRequest', () => {
  test('accepts a valid submission and trims the text', () => {
    expect(validateContactRequest(submission({ name: '  Pat Example  ' }))).toEqual(submission());
  });

  test('organization is optional', () => {
    const { organization, ...rest } = submission();
    expect(validateContactRequest(rest)).toEqual({ ...rest, organization: '' });
  });

  test('drops fields the form doesn’t send', () => {
    const result = validateContactRequest(submission({ status: 'done', isAdmin: true }));
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('isAdmin');
  });

  test.each([
    ['a missing email', { email: undefined }],
    ['a whitespace-only name', { name: '   ' }],
    ['a non-string message', { message: 42 }],
    ['a message over 3000 characters', { message: 'a'.repeat(3001) }],
    ['a name over 100 characters', { name: 'a'.repeat(101) }],
    ['an unknown role', { role: 'Administrator' }],
    ['a non-boolean wantsPilot', { wantsPilot: 'yes' }],
  ])('rejects %s', (_, overrides) => {
    expect(validateContactRequest(submission(overrides))).toBeNull();
  });

  test('rejects a missing payload', () => {
    expect(validateContactRequest(undefined)).toBeNull();
  });
});

describe('clientKey', () => {
  test('uses the first X-Forwarded-For address, so proxies after it don’t matter', () => {
    const a = clientKey({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } });
    const b = clientKey({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.2' } });
    expect(a).toBe(b);
  });

  test('different addresses get different keys', () => {
    expect(clientKey({ ip: '203.0.113.5' })).not.toBe(clientKey({ ip: '203.0.113.6' }));
  });

  test('the key doesn’t contain the address', () => {
    expect(clientKey({ ip: '203.0.113.5' })).not.toContain('203.0.113.5');
  });
});
