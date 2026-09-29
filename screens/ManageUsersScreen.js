import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
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
import UserAvatar from '../components/UserAvatar';
import LoadError from '../components/LoadError';
import OrgIdBadge from '../components/OrgIdBadge';
import { auth, db, functions } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

const callListOrgMembers = httpsCallable(functions, 'listOrgMembers');
const callRemoveOrgMember = httpsCallable(functions, 'removeOrgMember');
const callApproveOrgMember = httpsCallable(functions, 'approveOrgMember');
const callDenyOrgMember = httpsCallable(functions, 'denyOrgMember');

// Administrator Mode → Manage Users (also reachable from Settings). Lists
// everyone in the organization with their role and how many residents
// they're assigned to, so the admin can review who has access to whom, and
// lets the admin remove someone.
//
// Removing is done by the removeOrgMember Cloud Function: it clears the
// person's organization link, takes them off every resident, and hands
// residents they created to the admin — so they genuinely lose access, not
// just disappear from this list. It needs the admin's password (the server
// requires a recent sign-in for destructive actions), asked for inline
// rather than in an Alert, since Alert buttons don't work on web.
//
// Join requests: anyone who enters the invite code waits here under
// "Waiting for approval" until the admin approves or denies them
// (approveOrgMember / denyOrgMember). Neither needs the password: approving
// is what the admin is here to do, and denying only drops a request.
//
// Only the organization's own administrator (its creator/owner) can use
// this; anyone else sees a short explanation. The member list itself comes
// from the server because firestore.rules only let users read their own
// profile.
export default function ManageUsersScreen({ navigation }) {
  // undefined while loading; null when there's nothing to manage.
  const [orgId, setOrgId] = useState(undefined);
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  // uid of the request being approved/denied, so only its buttons disable.
  const [decidingUid, setDecidingUid] = useState(null);
  const [decideError, setDecideError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  // The member being removed (shows the confirm panel), plus its state.
  const [removing, setRemoving] = useState(null);
  const [password, setPassword] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    setLoadError(false);
    try {
      const userData = (await getDoc(doc(db, 'users', uid))).data();
      const id = userData?.orgId ?? null;
      if (!id) {
        setOrgId(null);
        return;
      }
      const org = (await getDoc(doc(db, 'organizations', id))).data();
      const owner = !!org && (org.createdBy === uid || org.adminId === uid);
      setOrgId(id);
      setIsOwner(owner);
      if (owner) {
        const result = await callListOrgMembers({ orgId: id });
        setMembers(result.data.members);
        setPending(result.data.pending ?? []);
      }
    } catch (e) {
      console.error('[ManageUsers] failed to load members:', e.code, e.message, e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Approves or denies one join request, then reloads both lists (an
  // approved person moves from the requests into the members).
  async function decide(person, approve) {
    setDecidingUid(person.uid);
    setDecideError('');
    setNotice('');
    try {
      await (approve ? callApproveOrgMember : callDenyOrgMember)({
        orgId,
        memberUid: person.uid,
      });
      setNotice(
        approve
          ? `${person.name} can now use the organization.`
          : `${person.name}’s request was declined.`
      );
      await load();
    } catch (e) {
      console.error('[ManageUsers] failed to decide request:', e.code, e.message, e);
      // not-found: cancelled, or another admin action got there first.
      setDecideError(
        e.code === 'functions/not-found' || e.code === 'functions/failed-precondition'
          ? e.message
          : 'Something went wrong. Please try again.'
      );
      await load();
    } finally {
      setDecidingUid(null);
    }
  }

  function startRemove(member) {
    setRemoving(member);
    setPassword('');
    setRemoveError('');
    setNotice('');
  }

  async function confirmRemove() {
    if (!password || !removing) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      // Re-enter the password first: it confirms the admin means it, and
      // refreshes the sign-in time the server checks.
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await callRemoveOrgMember({ orgId, memberUid: removing.uid });
      setNotice(`${removing.name} was removed from the organization.`);
      setRemoving(null);
      setPassword('');
      await load();
    } catch (e) {
      console.error('[ManageUsers] failed to remove member:', e.code, e.message, e);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setRemoveError('That password is incorrect.');
      } else if (e.code === 'auth/too-many-requests') {
        setRemoveError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setRemoveError(
          `Something went wrong and ${removing.name} was not removed. Please try again.`
        );
      }
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} />
        <OrgIdBadge />
        <Text style={styles.heading}>Manage Users</Text>

        {loadError ? (
          <LoadError onRetry={load} />
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : orgId === null ? (
          <Text style={styles.body}>You are not part of an organization yet.</Text>
        ) : !isOwner ? (
          <Text style={styles.body}>
            Only the administrator who owns this organization can manage its members.
          </Text>
        ) : (
          <>
            <Text style={styles.body}>
              Everyone in your organization. Removing someone takes away their access to all of its
              residents; their account itself isn’t deleted.
            </Text>

            {notice ? <Text style={styles.successBanner}>{notice}</Text> : null}

            {pending.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Waiting for approval</Text>
                {decideError ? (
                  <Text style={styles.errorBanner} accessibilityRole="alert">
                    {decideError}
                  </Text>
                ) : null}
                <View style={[styles.card, styles.pendingCard]}>
                  {pending.map((p, i) => (
                    <View
                      key={p.uid}
                      style={[styles.pendingRow, i < pending.length - 1 && styles.memberRowBorder]}
                    >
                      <View style={styles.memberRow}>
                        <UserAvatar uid={p.uid} name={p.name} size={40} />
                        <View style={styles.memberText}>
                          <Text style={styles.memberName}>{p.name}</Text>
                          <Text style={styles.memberMeta}>{p.role || 'No role'}</Text>
                        </View>
                      </View>
                      <View style={styles.decideRow}>
                        <TouchableOpacity
                          style={[styles.approveButton, decidingUid && styles.disabled]}
                          onPress={() => decide(p, true)}
                          disabled={!!decidingUid}
                          accessibilityRole="button"
                          accessibilityLabel={`Approve ${p.name}`}
                        >
                          <Text style={styles.approveText}>
                            {decidingUid === p.uid ? 'Saving…' : 'Approve'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.denyButton, decidingUid && styles.disabled]}
                          onPress={() => decide(p, false)}
                          disabled={!!decidingUid}
                          accessibilityRole="button"
                          accessibilityLabel={`Deny ${p.name}`}
                        >
                          <Text style={styles.denyText}>Deny</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Members</Text>
              </>
            ) : null}

            {members.length === 0 ? (
              <Text style={styles.note}>
                Nobody else has joined yet. Share your organization’s invite code so they can.
              </Text>
            ) : (
              <View style={styles.card}>
                {members.map((m, i) => (
                  <View
                    key={m.uid}
                    style={[styles.memberRow, i < members.length - 1 && styles.memberRowBorder]}
                  >
                    {/* Their profile picture — same organization, so visible. */}
                    <UserAvatar uid={m.uid} name={m.name} size={40} />
                    <View style={styles.memberText}>
                      <Text style={styles.memberName}>{m.name}</Text>
                      <Text style={styles.memberMeta}>
                        {[
                          m.role || 'No role',
                          `${m.assignedResidents} resident${m.assignedResidents === 1 ? '' : 's'}`,
                        ].join(' · ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => startRemove(m)}
                      style={styles.removeButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${m.name}`}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {removing ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmText}>
                  {`Remove ${removing.name}? They’ll lose access to every resident in this organization, and residents they added will be handed to you.`}
                </Text>
                {removeError ? (
                  <Text style={styles.errorBanner} accessibilityRole="alert">
                    {removeError}
                  </Text>
                ) : null}
                <Text style={styles.label}>Your password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password to confirm"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  accessibilityLabel="Your password"
                />
                <TouchableOpacity
                  style={[styles.dangerButton, (!password || removeBusy) && styles.disabled]}
                  onPress={confirmRemove}
                  disabled={!password || removeBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm removing ${removing.name}`}
                >
                  <Text style={styles.dangerButtonText}>
                    {removeBusy ? 'Removing…' : `Remove ${removing.name}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRemoving(null)}
                  disabled={removeBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 23,
    marginBottom: 20,
  },
  spinner: { marginTop: 32 },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.primary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 14,
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  // 56pt rows — comfortable targets on a shared iPad.
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
  },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberText: { flex: 1 },
  memberName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  memberMeta: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pendingCard: { marginBottom: 24 },
  pendingRow: { paddingBottom: 12 },
  decideRow: { flexDirection: 'row', gap: 12 },
  approveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: { fontFamily: fonts.sansBold, color: colors.white, fontSize: 16 },
  denyButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyText: { fontFamily: fonts.sansBold, color: colors.textPrimary, fontSize: 16 },
  removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  removeText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.destructive },
  confirmCard: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    padding: 18,
    backgroundColor: colors.surface,
  },
  confirmText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 23,
    marginBottom: 16,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 15,
    padding: 12,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 16,
    minHeight: 56,
  },
  dangerButton: {
    backgroundColor: colors.destructive,
    borderRadius: radii.sm,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  disabled: { opacity: 0.5 },
  dangerButtonText: { fontFamily: fonts.sansBold, color: colors.white, fontSize: 17 },
  cancelText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'center',
  },
});
