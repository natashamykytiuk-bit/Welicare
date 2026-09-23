import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import Dropdown from '../components/Dropdown';
import { auth, db, functions } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { ORG_TYPES, PROVINCES } from './CreateOrganizationScreen';

const callDeleteOrganization = httpsCallable(functions, 'deleteOrganization');
const callListOrgMembers = httpsCallable(functions, 'listOrgMembers');
const callTransferOrgAdmin = httpsCallable(functions, 'transferOrgAdmin');

// Reached from Settings' "Organizational Settings" row (Administrators
// only). A starter version: edit the organization's name/type/location,
// see its invite code, hand the organization to another member, and
// delete the organization outright.
//
// Editing is allowed only for the org's own admin (createdBy/adminId) —
// firestore.rules only lets createdBy update the org doc, so another
// Administrator in the same facility sees the details read-only rather
// than a form that would fail on save.
//
// Deleting goes through the deleteOrganization Cloud Function, since it
// has to remove every resident in the facility and clear orgId from other
// members' user docs, which the client can't do under the rules.
export default function OrganizationalSettingsScreen({ navigation }) {
  // undefined while loading, null if the user has no organization
  const [org, setOrg] = useState(undefined);
  const [orgId, setOrgId] = useState(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Delete confirmation is inline (type the org's name) rather than an
  // Alert, because Alert buttons don't fire on web.
  const [showDelete, setShowDelete] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Transfer administrator: members are fetched only when the section is
  // opened (via listOrgMembers, since the rules don't let the app read other
  // users' docs), then one is picked and confirmed inline.
  const [members, setMembers] = useState(null); // null = not loaded yet
  const [membersLoading, setMembersLoading] = useState(false);
  const [transferTo, setTransferTo] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOrg() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const id = userSnap.data()?.orgId;
      if (!id) {
        if (!cancelled) setOrg(null);
        return;
      }
      const orgSnap = await getDoc(doc(db, 'organizations', id));
      if (cancelled) return;
      const data = orgSnap.data() ?? null;
      setOrgId(id);
      setOrg(data);
      setIsOrgAdmin(!!data && (data.createdBy === uid || data.adminId === uid));
      setName(data?.name ?? '');
      setType(data?.type ?? '');
      setProvince(data?.province ?? '');
      setCity(data?.city ?? '');
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges =
    !!org &&
    (name.trim() !== (org.name ?? '') ||
      type !== (org.type ?? '') ||
      province !== (org.province ?? '') ||
      city.trim() !== (org.city ?? ''));

  async function handleSave() {
    setError('');
    setSuccess(false);
    if (!name.trim()) {
      setError('Organization name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updates = { name: name.trim(), type, province, city: city.trim() };
      await updateDoc(doc(db, 'organizations', orgId), updates);
      setOrg((prev) => ({ ...prev, ...updates }));
      setSuccess(true);
    } catch (e) {
      console.error('Org update error:', e.code, e.message, e);
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function loadMembers() {
    setTransferError('');
    setMembersLoading(true);
    try {
      const result = await callListOrgMembers({ orgId });
      setMembers(result.data.members);
    } catch (e) {
      console.error('List members error:', e.code, e.message, e);
      setTransferError("Couldn't load your organization's members. Please try again.");
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleTransfer() {
    setTransferError('');
    setTransferring(true);
    try {
      await callTransferOrgAdmin({ orgId, newAdminUid: transferTo.uid });
      // This person is no longer the org's owner, so drop straight into
      // the read-only view rather than leaving a form that can't save.
      setIsOrgAdmin(false);
      setOrg((prev) => ({ ...prev, createdBy: transferTo.uid, adminId: transferTo.uid }));
      setTransferTo(null);
    } catch (e) {
      console.error('Transfer admin error:', e.code, e.message, e);
      setTransferError('Something went wrong and the administrator was not changed. Please try again.');
    } finally {
      setTransferring(false);
    }
  }

  async function handleDelete() {
    setDeleteError('');
    setDeleting(true);
    try {
      await callDeleteOrganization({ orgId });
      // The admin no longer has an org, so send them to the same
      // join/create step App.js routes to for an Administrator without one.
      navigation.reset({ index: 0, routes: [{ name: 'JoinCreateOrganization' }] });
    } catch (e) {
      console.error('Org delete error:', e.code, e.message, e);
      setDeleteError('Something went wrong and the organization was not deleted. Please try again.');
      setDeleting(false);
    }
  }

  if (org === undefined) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Organizational Settings</Text>

        {!org ? (
          <Text style={styles.body}>You are not part of an organization yet.</Text>
        ) : (
          <>
            {org.inviteCode ? (
              <>
                <Text style={styles.label}>Invite code</Text>
                <Text style={styles.currentValue} selectable>
                  {org.inviteCode}
                </Text>
              </>
            ) : null}

            {!isOrgAdmin ? (
              <Text style={styles.body}>
                Only the administrator who created this organization can change its details.
              </Text>
            ) : null}

            {error ? (
              <Text style={styles.errorBanner} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {success ? <Text style={styles.successBanner}>Organization details saved.</Text> : null}

            <Text style={styles.label}>Organization name</Text>
            <TextInput
              style={[styles.input, !isOrgAdmin && styles.inputReadOnly]}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setSuccess(false);
              }}
              editable={isOrgAdmin}
              placeholder="Organization name"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Organization name"
            />

            {/* Dropdowns swapped for plain text when read-only, since
                Dropdown has no disabled state of its own. */}
            <Text style={styles.label}>Organization type</Text>
            {isOrgAdmin ? (
              <Dropdown
                label="Organization type"
                value={type}
                onValueChange={(v) => {
                  setType(v);
                  setSuccess(false);
                }}
                options={ORG_TYPES}
                placeholder="Select type…"
                accessibilityLabel="Organization type"
              />
            ) : (
              <Text style={styles.currentValue}>{type || '—'}</Text>
            )}

            <Text style={styles.label}>Province/Territory</Text>
            {isOrgAdmin ? (
              <Dropdown
                label="Province/Territory"
                value={province}
                onValueChange={(v) => {
                  setProvince(v);
                  setSuccess(false);
                }}
                options={PROVINCES}
                placeholder="Select province/territory…"
                accessibilityLabel="Province or territory"
              />
            ) : (
              <Text style={styles.currentValue}>{province || '—'}</Text>
            )}

            <Text style={styles.label}>City</Text>
            <TextInput
              style={[styles.input, !isOrgAdmin && styles.inputReadOnly]}
              value={city}
              onChangeText={(v) => {
                setCity(v);
                setSuccess(false);
              }}
              editable={isOrgAdmin}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="City"
            />

            {isOrgAdmin ? (
              <>
                <TouchableOpacity
                  style={[styles.button, (!hasChanges || saving) && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={!hasChanges || saving}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={saving ? 'Saving…' : 'Save changes'}
                >
                  <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                </TouchableOpacity>

                <Text style={[styles.label, styles.sectionGap]}>Transfer administrator</Text>
                <View style={styles.sectionCard}>
                  <Text style={styles.dangerText}>
                    Make another member the administrator of this organization. They'll be able to
                    edit or delete it; you'll keep your Administrator role but won't be able to
                    change these settings. You need to do this before deleting your account if
                    you're the only administrator.
                  </Text>
                  {transferError ? (
                    <Text style={styles.errorBanner} accessibilityRole="alert">
                      {transferError}
                    </Text>
                  ) : null}
                  {members === null ? (
                    <TouchableOpacity
                      onPress={loadMembers}
                      disabled={membersLoading}
                      accessibilityRole="button"
                      accessibilityLabel="Choose a new administrator"
                    >
                      <Text style={styles.sectionLink}>
                        {membersLoading ? 'Loading members…' : 'Choose a new administrator'}
                      </Text>
                    </TouchableOpacity>
                  ) : members.length === 0 ? (
                    <Text style={styles.body}>
                      There's nobody else in this organization yet. Share the invite code above so
                      someone can join first.
                    </Text>
                  ) : transferTo ? (
                    <>
                      <Text style={styles.dangerText}>
                        Make {transferTo.name} the administrator of {org.name || 'this organization'}?
                      </Text>
                      <TouchableOpacity
                        style={[styles.button, transferring && styles.buttonDisabled]}
                        onPress={handleTransfer}
                        disabled={transferring}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Make ${transferTo.name} administrator`}
                      >
                        <Text style={styles.buttonText}>
                          {transferring ? 'Transferring…' : `Make ${transferTo.name} administrator`}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTransferTo(null)}
                        disabled={transferring}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                      >
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    members.map((m, i) => (
                      <TouchableOpacity
                        key={m.uid}
                        style={[styles.memberRow, i < members.length - 1 && styles.memberRowBorder]}
                        onPress={() => setTransferTo(m)}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.name}, ${m.role || 'no role'}`}
                      >
                        <Text style={styles.memberName}>{m.name}</Text>
                        <Text style={styles.memberRole}>{m.role || '—'}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <Text style={[styles.label, styles.dangerLabel]}>Danger zone</Text>
                <View style={styles.dangerCard}>
                  {!showDelete ? (
                    <TouchableOpacity
                      onPress={() => setShowDelete(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete organization"
                    >
                      <Text style={styles.dangerLink}>Delete organization</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={styles.dangerText}>
                        This permanently deletes {org.name || 'this organization'}, every resident in
                        it (including their life stories) and its music library. Members keep their
                        accounts but will need to join or create a new organization. This can't be
                        undone.
                      </Text>
                      {deleteError ? (
                        <Text style={styles.errorBanner} accessibilityRole="alert">
                          {deleteError}
                        </Text>
                      ) : null}
                      <Text style={styles.label}>Type the organization's name to confirm</Text>
                      <TextInput
                        style={styles.input}
                        value={confirmName}
                        onChangeText={setConfirmName}
                        placeholder={org.name ?? ''}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        accessibilityLabel="Type the organization's name to confirm"
                      />
                      {/* Compared against the saved name (org.name), not
                          the edit field, so unsaved edits can't change what
                          has to be typed. */}
                      <TouchableOpacity
                        style={[
                          styles.button,
                          styles.buttonDestructive,
                          (confirmName.trim() !== (org.name ?? '').trim() || deleting) &&
                            styles.buttonDisabled,
                        ]}
                        onPress={handleDelete}
                        disabled={confirmName.trim() !== (org.name ?? '').trim() || deleting}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={deleting ? 'Deleting organization…' : 'Permanently delete organization'}
                      >
                        <Text style={styles.buttonText}>
                          {deleting ? 'Deleting…' : 'Permanently delete organization'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setShowDelete(false);
                          setConfirmName('');
                          setDeleteError('');
                        }}
                        disabled={deleting}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                      >
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 26,
    marginBottom: 20,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 16,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
  },
  successBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 16,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  currentValue: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 20,
    minHeight: 56,
  },
  input: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 20,
    minHeight: 56,
  },
  inputReadOnly: { backgroundColor: colors.mistBackground, color: colors.textMuted },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  buttonDestructive: { backgroundColor: colors.destructive },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
  },
  sectionGap: { marginTop: 16 },
  sectionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    padding: 18,
    marginBottom: 12,
  },
  sectionLink: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.primary },
  // 48pt min rows — easy targets for older staff on a shared iPad.
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 10,
  },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary, flexShrink: 1 },
  memberRole: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.textMuted, marginLeft: 12 },
  dangerLabel: { color: colors.destructive, marginTop: 16 },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    padding: 18,
  },
  dangerLink: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.destructive },
  dangerText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 23,
    marginBottom: 16,
  },
  cancelLink: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'center',
  },
});
