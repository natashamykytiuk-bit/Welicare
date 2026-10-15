// The rules can't import shared/constants.js, so this checks they still use
// every role, collection and field name it defines — a rename on one side
// fails here instead of silently breaking access.
import fs from 'fs';
import path from 'path';
import { COLLECTIONS, FIELDS, ROLES } from '../shared/constants';

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

describe('shared/constants.js matches firestore.rules', () => {
  it.each(Object.values(ROLES))("role '%s' appears in the rules", (role) => {
    expect(rules).toContain(`'${role}'`);
  });
  it.each(Object.values(COLLECTIONS))("collection '%s' has a match block", (name) => {
    expect(rules).toContain(`match /${name}/`);
  });
  it.each(Object.values(FIELDS))("field '%s' is used by the rules", (field) => {
    expect(rules).toContain(field);
  });
});
