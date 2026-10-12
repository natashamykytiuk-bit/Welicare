// Unit tests for the pure permission helpers in utils/residentPermissions.js.
// They mirror firestore.rules (tests/rules/residents.rules.test.js checks the
// rules themselves), so each case here has a matching rules test.

import {
  canArchiveResident,
  canCreateResident,
  canDeleteResident,
  canEditResident,
  canMoveResident,
  isAtHome,
} from '../utils/residentPermissions';

const facility = { name: 'Maple', isPersonal: false };
const familyOrg = { name: null, isPersonal: true };

const admin = { uid: 'admin', role: 'Administrator', orgId: 'orgA' };
const caregiver = { uid: 'care', role: 'Caregiver', orgId: 'orgA' };
const volunteer = { uid: 'vol', role: 'Volunteer', orgId: 'orgA' };
const family = { uid: 'fam', role: 'Family Caregiver', orgId: 'famOrg' };
const familyNoOrg = { uid: 'fam2', role: 'Family Caregiver' };

// A resident in facility orgA, added by the caregiver.
const facilityResident = {
  name: 'Ann',
  facilityId: 'orgA',
  createdBy: 'care',
  caregiverId: 'care',
};
// The family member's own resident, in their family organization.
const homeResident = { name: 'Dad', facilityId: 'famOrg', createdBy: 'fam', caregiverId: 'fam' };
// Their own resident with no organization at all.
const noOrgResident = { name: 'Gran', facilityId: null, createdBy: 'fam2', caregiverId: 'fam2' };
// After approveResidentMove: in the facility, the family member view-only.
const movedResident = {
  name: 'Mo',
  facilityId: 'orgA',
  createdBy: 'admin',
  caregiverId: 'admin',
  familyMembers: ['fam'],
};

describe('isAtHome', () => {
  it('is true with no organization, or in the viewer’s own family organization', () => {
    expect(isAtHome(familyNoOrg, null, noOrgResident)).toBe(true);
    expect(isAtHome(family, familyOrg, homeResident)).toBe(true);
  });

  it('is false in a care facility, or in someone else’s organization', () => {
    expect(isAtHome(family, familyOrg, movedResident)).toBe(false);
    expect(isAtHome(caregiver, facility, facilityResident)).toBe(false);
    expect(isAtHome(familyNoOrg, null, homeResident)).toBe(false);
  });
});

describe('canCreateResident', () => {
  it('Caregivers and Administrators can, once they belong to an organization', () => {
    expect(canCreateResident(admin, facility)).toBe(true);
    expect(canCreateResident(caregiver, facility)).toBe(true);
    expect(canCreateResident({ uid: 'x', role: 'Caregiver' }, null)).toBe(false);
  });

  it('Volunteers never can', () => {
    expect(canCreateResident(volunteer, facility)).toBe(false);
    expect(canCreateResident({ uid: 'v', role: 'Volunteer' }, null)).toBe(false);
  });

  it('a Family Caregiver can at home: family organization or none', () => {
    expect(canCreateResident(family, familyOrg)).toBe(true);
    expect(canCreateResident(familyNoOrg, null)).toBe(true);
  });

  it('a Family Caregiver attached to a care facility cannot', () => {
    expect(canCreateResident({ ...family, orgId: 'orgA' }, facility)).toBe(false);
  });

  it('nobody can before their role has loaded', () => {
    expect(canCreateResident({ uid: 'x', role: null }, null)).toBe(false);
    expect(canCreateResident(null, null)).toBe(false);
  });
});

describe('canEditResident', () => {
  it('staff can edit any resident in their own facility', () => {
    expect(canEditResident(admin, facility, facilityResident)).toBe(true);
    expect(canEditResident(caregiver, facility, movedResident)).toBe(true);
  });

  it('staff cannot edit another facility’s resident, even one they created', () => {
    const elsewhere = { ...facilityResident, facilityId: 'orgB' };
    expect(canEditResident(caregiver, facility, elsewhere)).toBe(false);
    expect(canEditResident(caregiver, facility, { ...facilityResident, facilityId: null })).toBe(
      false
    );
  });

  it('a Volunteer never can, even for a resident they created or are assigned to', () => {
    const theirs = {
      ...facilityResident,
      createdBy: 'vol',
      caregiverId: 'vol',
      assignedCaregivers: ['vol'],
    };
    expect(canEditResident(volunteer, facility, theirs)).toBe(false);
    expect(canEditResident(volunteer, facility, facilityResident)).toBe(false);
  });

  it('a Family Caregiver can edit their own at-home resident', () => {
    expect(canEditResident(family, familyOrg, homeResident)).toBe(true);
    expect(canEditResident(familyNoOrg, null, noOrgResident)).toBe(true);
  });

  it('a Family Caregiver is view-only once the resident is in a facility', () => {
    expect(canEditResident(family, familyOrg, movedResident)).toBe(false);
    // Still recorded as the creator, but the resident now sits in orgA.
    expect(canEditResident(family, familyOrg, { ...homeResident, facilityId: 'orgA' })).toBe(false);
  });

  it('a Family Caregiver cannot edit someone else’s at-home resident', () => {
    expect(canEditResident(familyNoOrg, null, homeResident)).toBe(false);
    expect(canEditResident(family, familyOrg, noOrgResident)).toBe(false);
  });

  it('is false while the viewer or resident hasn’t loaded', () => {
    expect(canEditResident(null, null, facilityResident)).toBe(false);
    expect(canEditResident(admin, facility, null)).toBe(false);
  });
});

describe('canArchiveResident', () => {
  it('follows editing: staff in the facility and family at home, never volunteers', () => {
    expect(canArchiveResident(caregiver, facility, facilityResident)).toBe(true);
    expect(canArchiveResident(family, familyOrg, homeResident)).toBe(true);
    expect(canArchiveResident(volunteer, facility, facilityResident)).toBe(false);
    expect(canArchiveResident(family, familyOrg, movedResident)).toBe(false);
  });
});

describe('canDeleteResident', () => {
  it('in a facility, only its Administrators can', () => {
    expect(canDeleteResident(admin, facility, facilityResident)).toBe(true);
    expect(canDeleteResident(caregiver, facility, facilityResident)).toBe(false);
    expect(canDeleteResident(volunteer, facility, facilityResident)).toBe(false);
    expect(canDeleteResident(admin, facility, { ...facilityResident, facilityId: 'orgB' })).toBe(
      false
    );
  });

  it('a Family Caregiver can delete their own at-home resident, not a moved one', () => {
    expect(canDeleteResident(family, familyOrg, homeResident)).toBe(true);
    expect(canDeleteResident(familyNoOrg, null, noOrgResident)).toBe(true);
    expect(canDeleteResident(family, familyOrg, movedResident)).toBe(false);
  });
});

describe('canMoveResident', () => {
  it('a Family Caregiver can offer their own at-home resident to an organization', () => {
    expect(canMoveResident(family, familyOrg, homeResident)).toBe(true);
    expect(canMoveResident(familyNoOrg, null, noOrgResident)).toBe(true);
  });

  it('not while a move is already waiting, or the resident is archived', () => {
    expect(canMoveResident(family, familyOrg, { ...homeResident, pendingFacilityId: 'orgA' })).toBe(
      false
    );
    expect(canMoveResident(family, familyOrg, { ...homeResident, archived: true })).toBe(false);
  });

  it('not a resident already in a facility, and never staff or volunteers', () => {
    expect(canMoveResident(family, familyOrg, movedResident)).toBe(false);
    expect(canMoveResident(caregiver, facility, facilityResident)).toBe(false);
    expect(canMoveResident(volunteer, facility, facilityResident)).toBe(false);
  });
});

// Archived residents are split out of the everyday lists
// (utils/residentManagement.js) — the pure half of archiving.
describe('splitArchived', () => {
  const { splitArchived } = jest.requireActual('../utils/residentManagement');

  it('separates archived residents, keeping each group in order', () => {
    const list = [
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bo', archived: true },
      { id: 'c', name: 'Cy', archived: false },
    ];
    const { active, archived } = splitArchived(list);
    expect(active.map((r) => r.id)).toEqual(['a', 'c']);
    expect(archived.map((r) => r.id)).toEqual(['b']);
  });
});
