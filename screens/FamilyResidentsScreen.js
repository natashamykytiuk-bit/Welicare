import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import ResidentAvatar from '../components/ResidentAvatar';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { redeemFamilyCode } from '../utils/familyLinks';
import { formatOrgCode } from '../utils/inviteCode';
import { cancelResidentMove, isArchived, setResidentArchived } from '../utils/residentManagement';
import { canArchiveResident, canEditResident, canMoveResident } from '../utils/residentPermissions';
import { loadViewer } from '../utils/viewer';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

// Family Mode's "My Residents" — reached from FamilyModeScreen.
//
// Lists the residents the family member is linked to (ones they created,
// were added to via assignedCaregivers, or linked to themselves with a
// family code — familyMembers), plus a box to enter a family code from a
// resident's care team (see utils/familyLinks.js). The rest of the screen
// (updates, visit notes, …) is still to be designed, hence the "Coming
// soon" note underneath.
//
// A family member has two kinds of resident, and each row says which:
//   - "At home": one they added themselves that isn't in a care facility.
//     Theirs to manage — Edit Profile, and "Move to an organization" if the
//     resident is moving into a care home (MoveResidentScreen). While a
//     move waits for the organization's administrator the row says so and
//     offers Cancel request.
//   - "In a care home": linked by a family code, or moved in. View-only —
//     the facility's caregivers and administrators keep the profile — so
//     the only button is Add Photos, which every linked family member has.
// Which buttons show comes from utils/residentPermissions.js (the app's
// copy of firestore.rules), so nothing is offered that would fail.
//
// Archived at-home residents stay in this list, marked "Archived", with a
// Restore button: this is the only resident list a family member has, so
// it's where an archive is undone.
//
// Three single-field queries merged client-side, same as ResidentModeScreen:
// each has to match its own `allow list` branch in firestore.rules, and a
// Family Caregiver can't list the whole facility.
export default function FamilyResidentsScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // { viewer, org } for the permission helpers; null until loaded.
  const [access, setAccess] = useState(null);
  // id of the resident whose Cancel request / Restore is in flight.
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState('');
  // The "Have a family code?" box.
  const [code, setCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkedMessage, setLinkedMessage] = useState('');

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFailed(false);
    try {
      const [owned, assigned, family] = await withTimeout(
        Promise.all([
          getDocs(query(collection(db, 'residents'), where('createdBy', '==', uid))),
          getDocs(
            query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid))
          ),
          getDocs(
            query(collection(db, 'residents'), where('familyMembers', 'array-contains', uid))
          ),
        ]),
        LOAD_TIMEOUT_MS,
        'timeout'
      );
      const merged = new Map();
      [...owned.docs, ...assigned.docs, ...family.docs].forEach((d) =>
        merged.set(d.id, { id: d.id, ...d.data() })
      );
      setResidents(
        Array.from(merged.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      );
      // Only decides which buttons show; if it fails the rows are simply
      // view-only (Add Photos), which is always safe.
      setAccess(await loadViewer().catch(() => null));
    } catch (e) {
      console.error('[FamilyResidents] failed to load residents:', e.code, e.message, e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Redeems a family code, then reloads so the newly linked resident shows.
  async function handleLink() {
    setLinking(true);
    setLinkError('');
    setLinkedMessage('');
    try {
      const { residentName } = await redeemFamilyCode(code);
      setCode('');
      setLinkedMessage(`You're now linked to ${residentName || 'your resident'}.`);
      await load();
    } catch (e) {
      console.error('[FamilyResidents] failed to redeem family code:', e.code, e.message, e);
      setLinkError(e.message || 'That code did not work. Please try again.');
    } finally {
      setLinking(false);
    }
  }

  // Withdraws a move request that's still waiting; the resident just stays
  // at home.
  async function handleCancelMove(resident) {
    setBusyId(resident.id);
    setRowError('');
    try {
      await cancelResidentMove(resident.id);
      await load();
    } catch (e) {
      console.error('[FamilyResidents] failed to cancel move:', e.code, e.message, e);
      setRowError(e.message || 'That didn’t work. Please try again.');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(resident) {
    setBusyId(resident.id);
    setRowError('');
    try {
      await setResidentArchived(resident.id, false);
      await load();
    } catch (e) {
      console.error('[FamilyResidents] failed to restore resident:', e.code, e.message, e);
      setRowError('Could not restore this resident. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  // Everything a row needs to know about one resident for this viewer.
  function describe(resident) {
    const mayEdit = !!access && canEditResident(access.viewer, access.org, resident);
    const archived = isArchived(resident);
    const movePending =
      !!resident.pendingFacilityId && resident.pendingMoveBy === access?.viewer?.uid;
    let status = 'In a care home · view only';
    if (archived) status = 'Archived';
    else if (movePending) status = 'Waiting for the organization to approve the move';
    else if (mayEdit) status = 'At home · you manage this profile';
    return {
      archived,
      movePending,
      status,
      showEdit: mayEdit && !archived,
      showMove: !!access && canMoveResident(access.viewer, access.org, resident),
      showRestore: archived && !!access && canArchiveResident(access.viewer, access.org, resident),
    };
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.heading}>My Residents</Text>
        <Text style={styles.body}>
          The people you care for. Share photos for their album, and keep the profile up to date for
          anyone you look after at home.
        </Text>
        {rowError ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {rowError}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : failed ? (
          <LoadError onRetry={load} />
        ) : residents.length === 0 ? (
          <Text style={styles.body}>
            You aren't linked to any residents yet. If your loved one lives in a care home, ask
            their care team for a family code and enter it below. If you look after them at home,
            add them from Resident Mode.
          </Text>
        ) : (
          residents.map((r) => {
            const row = describe(r);
            const label = r.name || 'resident';
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.row}>
                  <ResidentAvatar
                    name={r.name}
                    photoPath={r.photoPath}
                    photoUpdatedAt={r.photoUpdatedAt}
                    size={44}
                  />
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {r.name || 'Unnamed resident'}
                    </Text>
                    <Text style={styles.rowStatus}>{row.status}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  {row.archived ? null : (
                    <TouchableOpacity
                      style={styles.button}
                      onPress={() =>
                        navigation.navigate('ResidentPhotoUpload', {
                          residentId: r.id,
                          residentName: r.name,
                        })
                      }
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Add photos for ${label}`}
                    >
                      <Ionicons name="images-outline" size={20} color={colors.white} />
                      <Text style={styles.buttonText}>Add Photos</Text>
                    </TouchableOpacity>
                  )}
                  {row.showEdit ? (
                    <TouchableOpacity
                      style={styles.outlineButton}
                      onPress={() =>
                        navigation.navigate('BuildProfile', {
                          residentId: r.id,
                          returnTo: 'FamilyResidents',
                        })
                      }
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit profile for ${label}`}
                    >
                      <Ionicons name="create-outline" size={20} color={colors.primary} />
                      <Text style={styles.outlineButtonText}>Edit Profile</Text>
                    </TouchableOpacity>
                  ) : null}
                  {row.showMove ? (
                    <TouchableOpacity
                      style={styles.outlineButton}
                      onPress={() =>
                        navigation.navigate('MoveResident', {
                          residentId: r.id,
                          residentName: r.name,
                        })
                      }
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${label} to an organization`}
                    >
                      <Ionicons name="business-outline" size={20} color={colors.primary} />
                      <Text style={styles.outlineButtonText}>Move to an organization</Text>
                    </TouchableOpacity>
                  ) : null}
                  {row.movePending && !row.archived ? (
                    <TouchableOpacity
                      style={styles.outlineButton}
                      onPress={() => handleCancelMove(r)}
                      disabled={busyId !== null}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel the request to move ${label}`}
                    >
                      <Text style={styles.outlineButtonText}>
                        {busyId === r.id ? 'Cancelling…' : 'Cancel request'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {row.showRestore ? (
                    <TouchableOpacity
                      style={styles.outlineButton}
                      onPress={() => handleRestore(r)}
                      disabled={busyId !== null}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${label}`}
                    >
                      <Ionicons name="arrow-undo-outline" size={20} color={colors.primary} />
                      <Text style={styles.outlineButtonText}>
                        {busyId === r.id ? 'Restoring…' : 'Restore'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* Family code entry — codes come from a resident's care team
            (Resident Profile → Family access). */}
        <View style={styles.linkCard}>
          <Text style={styles.linkTitle}>Have a family code?</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(formatOrgCode(t))}
            placeholder="ABCD-1234"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Family code"
          />
          <TouchableOpacity
            style={[styles.button, styles.linkButton, code.length < 9 && styles.disabled]}
            onPress={handleLink}
            disabled={linking || code.length < 9}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Link resident"
          >
            {linking ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Link resident</Text>
            )}
          </TouchableOpacity>
          {linkError ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {linkError}
            </Text>
          ) : null}
          {linkedMessage ? <Text style={styles.successText}>{linkedMessage}</Text> : null}
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>More coming soon</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconNoMargin: { marginBottom: 0 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
    lineHeight: 24,
    marginBottom: 20,
  },
  loading: { marginTop: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.textPrimary },
  rowStatus: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Buttons wrap onto a second line on a phone rather than squeezing.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  outlineButtonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.primary },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  buttonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.white },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 8,
  },
  linkTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  input: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  linkButton: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 12 },
  disabled: { opacity: 0.5 },
  errorText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    marginTop: 10,
  },
  successText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.primary,
    marginTop: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.circular,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  badgeText: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.primary },
});
