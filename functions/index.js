const { setGlobalOptions } = require('firebase-functions/v2');

// Every function runs in Montréal, the same region as the Firestore
// database, so resident data is processed in Canada rather than the default
// us-central1 (Iowa). The app must call the same region — see REGION in
// firebaseConfig.js — and firebase.json's postdeploy list names it too.
// (The AI request itself still goes to Anthropic's API in the US.)
//
// maxInstances caps how many copies of each function can run at once. Without
// it a flood of requests (even ones that are then refused) scales up to the
// platform default of 100 and is billed for all of them; 10 is far more than
// real use needs, since each instance handles many requests at a time.
setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 });

// Every module below defines its functions at require time, so they're
// required AFTER setGlobalOptions and all pick up the Montréal region.
// Each deployed function is listed by name: the names are the deployed
// Cloud Run services (see firebase.json's postdeploy list), so renaming one
// here would deploy a new function and orphan the old one.
const { getAdmin } = require('./shared');
const { auditTriggers } = require('./auditLog');
const accounts = require('./accounts');
const organizations = require('./organizations');
const residents = require('./residents');

exports.generateSuggestions = require('./ai').generateSuggestions;
exports.searchYouTube = require('./youtube').searchYouTube;
// The public website's Contact form, rate-limited per IP (contactRequest.js).
exports.submitContactRequest = require('./contactRequest').makeSubmitContactRequest();

// Activity-log triggers for changes the app makes directly (a resident
// deleted, the volunteer permission changed) — see auditLog.js.
const triggers = auditTriggers(getAdmin);
exports.auditResidentDeleted = triggers.auditResidentDeleted;
exports.auditVolunteerPermissions = triggers.auditVolunteerPermissions;

exports.deleteAccount = accounts.deleteAccount;
exports.resolveSignInEmail = accounts.resolveSignInEmail;

exports.createOrganization = organizations.createOrganization;
exports.regenerateInviteCode = organizations.regenerateInviteCode;
exports.joinOrganization = organizations.joinOrganization;
exports.listOrgMembers = organizations.listOrgMembers;
exports.approveOrgMember = organizations.approveOrgMember;
exports.denyOrgMember = organizations.denyOrgMember;
exports.removeOrgMember = organizations.removeOrgMember;
exports.transferOrgAdmin = organizations.transferOrgAdmin;
exports.deleteOrganization = organizations.deleteOrganization;

exports.createFamilyCode = residents.createFamilyCode;
exports.redeemFamilyCode = residents.redeemFamilyCode;
exports.listFamilyMembers = residents.listFamilyMembers;
exports.unlinkFamilyMember = residents.unlinkFamilyMember;
exports.deleteResident = residents.deleteResident;
exports.requestResidentMove = residents.requestResidentMove;
exports.cancelResidentMove = residents.cancelResidentMove;
exports.approveResidentMove = residents.approveResidentMove;
exports.denyResidentMove = residents.denyResidentMove;
