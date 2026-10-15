import { describe, expect, it } from 'vitest';
import { homePathFor } from './routing';

describe('homePathFor', () => {
  it.each([
    [{ role: 'Administrator', orgId: 'o' }, '/admin'],
    [{ role: 'Caregiver', orgId: 'o' }, '/caregiver'],
    [{ role: 'Family Caregiver' }, '/family'],
    [{ role: 'Volunteer', orgId: 'o' }, '/use-the-app'],
    [{ role: 'Caregiver', pendingOrgId: 'o' }, '/pending'],
    [{ role: 'Administrator' }, '/pending'],
    [{}, '/no-profile'],
  ])('%o → %s', (profile, path) => expect(homePathFor(profile)).toBe(path));
  it('no profile at all', () => expect(homePathFor(null)).toBe('/no-profile'));
});
