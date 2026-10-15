import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import ResidentAvatar from '../components/ResidentAvatar';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { deleteResident, isArchived, setResidentArchived } from '../utils/residentManagement';
import {
  canArchiveResident,
  canCreateResident,
  canDeleteResident,
  canEditResident,
} from '../utils/residentPermissions';
import { loadViewer } from '../utils/viewer';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

// Roles that see every resident in their facility.
const FACILITY_STAFF_ROLES = ['Caregiver', 'Administrator', 'Volunteer'];

// The residents a role gets on top of the createdBy / assignedCaregivers
// lists, as query docs:
//   - facility staff (Caregiver, Administrator, Volunteer) with an
//     organization: every resident in their facility, automatically — there
//     is no "Select from organization" step any more;
//   - Family Caregiver: residents they linked to with a family code
//     (familyMembers — see utils/familyLinks.js), never the whole facility;
//   - anyone else: none.
// Reads the user's own doc for role/orgId rather than reusing the screen's
// `role` state, since the resident load can run before that state arrives.
export async function loadRoleResidents(uid) {
  if (!uid) return [];
  const userSnap = await withTimeout(
    getDoc(doc(db, 'users', uid)),
    LOAD_TIMEOUT_MS,
    'Loading residents is taking longer than expected. Please check your connection and try again.'
  );
  const { role, orgId } = userSnap.data() ?? {};
  let clause = null;
  // Same role list as seesWholeFacility() in firestore.rules, which is what
  // permits this query.
  if (FACILITY_STAFF_ROLES.includes(role) && orgId) clause = where('facilityId', '==', orgId);
  else if (role === 'Family Caregiver') clause = where('familyMembers', 'array-contains', uid);
  if (!clause) return [];
  const snap = await withTimeout(
    getDocs(query(collection(db, 'residents'), clause)),
    LOAD_TIMEOUT_MS,
    'Loading residents is taking longer than expected. Please check your connection and try again.'
  ).catch((e) => {
    console.error('[ResidentMode] role residents query failed:', e.code, e.message, e);
    throw e;
  });
  return snap.docs;
}

// This is the resident-selection screen: full dark-green header, a grid of
// saved residents, plus Guest Mode / Add Resident entry points. It's the
// same screen ModeSelectionScreen and AppJS route to as "ResidentMode" —
// the route name is unchanged even though the screen itself now does real
// work (it used to just simulate picking a resident via a hardcoded name).
//
// What each person is offered follows utils/residentPermissions.js (the
// app's copy of firestore.rules):
//   - Add Resident: Caregivers and Administrators (into their organization)
//     and Family Caregivers (at home). Volunteers never see it.
//   - A resident's options menu — Edit Profile, Archive, Delete permanently
//     — only lists what that person may do for that resident, and isn't
//     shown at all when that's nothing (volunteers, and family members for
//     a resident who lives in a care facility).
// Archived residents are left off this screen: it's for starting a session,
// and an archived resident isn't having any. They're restored from My
// Residents.
export default function ResidentModeScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  // Shown after archiving, so it's clear the resident wasn't deleted.
  const [notice, setNotice] = useState('');
  // Who is signed in ({ viewer, org } from loadViewer), or null until that
  // has loaded. Every create/edit/archive/delete control is decided from it,
  // so they stay hidden rather than shown and then failing on tap.
  const [access, setAccess] = useState(null);
  // False once we know the user has no organization. Guest Mode visits are
  // filed under the user's organization (utils/activitySessions.js), so
  // without one they can't be recorded — the Guest Mode card says so,
  // rather than the time silently going missing from the stats. Assumed
  // true until known, so the note never flashes up for everyone else.
  const [hasOrg, setHasOrg] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAccess() {
      if (!auth.currentUser?.uid) return;
      // This only decides which controls show, so a failed read leaves
      // `access` null — Add Resident and the options menus stay hidden (the
      // safe default) and the resident list itself is unaffected.
      try {
        const loaded = await loadViewer();
        if (!cancelled) {
          setAccess(loaded);
          setHasOrg(!!loaded.viewer.orgId);
        }
      } catch (e) {
        console.error('[ResidentMode] failed to load permissions:', e.code, e.message, e);
      }
    }
    loadAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the resident picker goes straight back to the home screen
  // (ModeSelection) with no PIN: nothing staff-only is reachable from there
  // without one, since every other mode asks for the PIN on the way in. The
  // PIN lock that keeps a resident inside a session is on ActivityMenuScreen.
  // The back arrow and Android's back button share this.
  const exitToHome = useCallback(
    () => navigation.navigate('ModeSelection', { animation: 'slide_from_left' }),
    [navigation]
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        exitToHome();
        return true;
      });
      return () => subscription.remove();
    }, [exitToHome])
  );

  // Two simple single-field queries merged client-side, rather than one
  // where()+orderBy() compound query — that combination needs a composite
  // Firestore index, and this project doesn't ship one. An undeployed
  // index makes getDocs() throw failed-precondition, which (before this
  // fix) was never caught, so `loading` stayed true forever. Splitting the
  // OR into two simple queries and sorting client-side sidesteps needing
  // any composite index at all, and the try/catch below means a real
  // failure now surfaces an error instead of an infinite spinner.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function loadResidents() {
        setLoading(true);
        setError('');
        const uid = auth.currentUser?.uid;
        try {
          // Queried and caught separately (not Promise.all) so a
          // permission-denied on one doesn't hide which one it was — a
          // single combined catch made this impossible to diagnose.
          const ownedSnap = await withTimeout(
            getDocs(query(collection(db, 'residents'), where('createdBy', '==', uid))),
            LOAD_TIMEOUT_MS,
            'Loading residents is taking longer than expected. Please check your connection and try again.'
          ).catch((e) => {
            console.error('[ResidentMode] createdBy query failed:', e.code, e.message, e);
            throw e;
          });
          const assignedSnap = await withTimeout(
            getDocs(
              query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid))
            ),
            LOAD_TIMEOUT_MS,
            'Loading residents is taking longer than expected. Please check your connection and try again.'
          ).catch((e) => {
            console.error('[ResidentMode] assignedCaregivers query failed:', e.code, e.message, e);
            throw e;
          });
          // Facility staff (Caregivers, Administrators, Volunteers) run
          // sessions for anyone in their facility, so they also get the
          // whole-facility query — its own `allow list` rule
          // (seesWholeFacility) permits it. Family Caregivers get the
          // residents they linked to with a family code instead, and must
          // never get the facility query (the rule refuses it anyway).
          const facilityDocs = await loadRoleResidents(uid);
          if (cancelled) return;
          const merged = new Map();
          [...ownedSnap.docs, ...assignedSnap.docs, ...facilityDocs].forEach((d) =>
            merged.set(d.id, { id: d.id, ...d.data() })
          );
          // Archived residents aren't offered for a session (see the header
          // comment); filtered here because the list rules can't do it.
          const list = Array.from(merged.values())
            .filter((r) => !isArchived(r))
            .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
          setResidents(list);
        } catch (e) {
          console.error('[ResidentMode] failed to load residents:', e.code, e.message, e);
          setError(e.code ? 'Could not load your residents. Please try again.' : e.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      loadResidents();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // What the signed-in person may do for one resident. All false until
  // `access` has loaded.
  function optionsFor(resident) {
    if (!access) return { edit: false, archive: false, remove: false };
    return {
      edit: canEditResident(access.viewer, access.org, resident),
      archive: canArchiveResident(access.viewer, access.org, resident),
      remove: canDeleteResident(access.viewer, access.org, resident),
    };
  }
  const hasOptions = (resident) => Object.values(optionsFor(resident)).some(Boolean);
  const canAdd = !!access && canCreateResident(access.viewer, access.org);

  // A custom Modal rather than Alert.alert — Alert.alert is a no-op on web
  // (react-native-web ships it as an empty stub), which made this
  // confirmation, and therefore the whole remove flow, silently do nothing
  // when the app runs in a browser.
  //
  // Deleting runs in the deleteResident Cloud Function: it has to remove the
  // life story, safety notes, photo album, the files in Storage and any
  // family codes along with the resident, which the app can't do itself
  // (firestore.rules refuse deletes from the app for exactly that reason).
  async function performRemove() {
    if (!confirmTarget) return;
    setRemoving(true);
    try {
      await deleteResident(confirmTarget.id);
      setResidents((prev) => prev.filter((r) => r.id !== confirmTarget.id));
      setConfirmTarget(null);
    } catch (e) {
      console.error('[ResidentMode] failed to delete resident:', e.code, e.message, e);
      setError('Could not delete this resident. Nothing was removed — please try again.');
      setConfirmTarget(null);
    } finally {
      setRemoving(false);
    }
  }

  // Archiving needs no confirmation: nothing is deleted and it's undone
  // with Restore in My Residents — the notice says so.
  async function handleArchive(resident) {
    setMenuFor(null);
    setError('');
    setNotice('');
    try {
      await setResidentArchived(resident.id, true);
      setResidents((prev) => prev.filter((r) => r.id !== resident.id));
      setNotice(
        `${resident.name || 'This resident'} was archived. Nothing was deleted — you can restore them from My Residents.`
      );
    } catch (e) {
      console.error('[ResidentMode] failed to archive resident:', e.code, e.message, e);
      setError('Could not archive this resident. Please try again.');
    }
  }

  function handleEdit(resident) {
    setMenuFor(null);
    navigation.navigate('BuildProfile', { residentId: resident.id, returnTo: 'ResidentMode' });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.header}>
        {/* Not a plain goBack: this screen is reached via navigation.reset()
            when the PIN gate lets someone in, which wipes any prior stack
            entry — goBack() would then have nothing to pop to. */}
        <BackButton
          navigation={navigation}
          color={colors.white}
          style={styles.headerBack}
          onPress={exitToHome}
        />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Hello! Who are we visiting today?
        </Text>
        <Text style={styles.headerSubtitle}>Select a resident to begin their session</Text>
      </View>

      <FlatList
        data={residents}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <>
            {error ? (
              <Text style={styles.errorBanner} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}
            {loading ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
          </>
        }
        ListFooterComponent={
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ActivityMenu', { residentName: 'Guest' })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Guest Mode"
            >
              <Text style={styles.actionTitle}>Guest Mode</Text>
              <Text style={styles.actionSubtitle}>
                {hasOrg
                  ? 'Start a session without picking a resident'
                  : 'Start a session without picking a resident. Time isn’t recorded until you join an organization.'}
              </Text>
            </TouchableOpacity>

            {/* Only for people who may create residents (canCreateResident):
                volunteers never see it. */}
            {canAdd ? (
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('AddResident')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add Resident"
              >
                <Text style={styles.actionTitle}>Add Resident</Text>
                <Text style={styles.actionSubtitle}>Create a new resident profile</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardBody}
              onPress={() =>
                navigation.navigate('ActivityMenu', {
                  residentId: item.id,
                  residentName: item.name,
                })
              }
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint="Opens this resident's activities"
            >
              {/* Photo if they have one, else initials. */}
              <ResidentAvatar
                name={item.name}
                photoPath={item.photoPath}
                photoUpdatedAt={item.photoUpdatedAt}
                size={56}
                style={styles.avatar}
              />
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
            {/* No options menu when there's nothing this person may do for
                the resident (volunteers; family for a facility resident),
                rather than a menu whose items would fail. */}
            {hasOptions(item) ? (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={() => setMenuFor(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Options for ${item.name}`}
                accessibilityHint="Shows options such as edit and archive"
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />

      <Modal
        visible={!!menuFor}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        {/* Backdrop is a sibling behind the sheet so VoiceOver can reach each
            menu item (a wrapping Pressable reads as one unlabelled button). */}
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuFor(null)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
          <View style={styles.menuSheet} accessibilityViewIsModal>
            {menuFor && optionsFor(menuFor).edit ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleEdit(menuFor)}
                accessibilityRole="button"
                accessibilityLabel="Edit Profile"
              >
                <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Edit Profile</Text>
              </TouchableOpacity>
            ) : null}
            {menuFor && optionsFor(menuFor).archive ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleArchive(menuFor)}
                accessibilityRole="button"
                accessibilityLabel="Archive Resident"
              >
                <Ionicons name="archive-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Archive Resident</Text>
              </TouchableOpacity>
            ) : null}
            {menuFor && optionsFor(menuFor).remove ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  const resident = menuFor;
                  setMenuFor(null);
                  if (resident) setConfirmTarget(resident);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete Permanently"
              >
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                <Text style={[styles.menuItemText, { color: colors.destructive }]}>
                  Delete Permanently
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!confirmTarget}
        transparent
        animationType="fade"
        onRequestClose={() => (removing ? null : setConfirmTarget(null))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet} accessibilityViewIsModal>
            <Text style={styles.confirmTitle}>Delete {confirmTarget?.name} permanently?</Text>
            <Text style={styles.confirmBody}>
              This permanently deletes {confirmTarget?.name}’s profile, life story, safety notes and
              photos for everyone. It cannot be undone. To hide them without deleting anything, use
              Archive instead.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => setConfirmTarget(null)}
                disabled={removing}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.confirmButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmButtonDestructive]}
                onPress={performRemove}
                disabled={removing}
                accessibilityRole="button"
                accessibilityLabel="Delete permanently"
              >
                {removing ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.confirmButtonText, styles.confirmButtonTextDestructive]}>
                    Delete permanently
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerBack: { marginBottom: 20, backgroundColor: 'transparent', borderWidth: 0 },
  headerTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.white,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.white,
    opacity: 0.85,
  },
  spinner: { marginTop: 24 },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 15,
    padding: 14,
    margin: 16,
    marginBottom: 0,
    lineHeight: 21,
  },
  // Calm, non-error styling: archiving worked and nothing was lost.
  noticeBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 15,
    padding: 14,
    margin: 16,
    marginBottom: 0,
    lineHeight: 21,
  },
  grid: { padding: 16, paddingBottom: 40 },
  card: {
    flex: 1 / 3,
    margin: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  cardBody: { alignItems: 'center', width: '100%' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.white,
  },
  cardName: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  // 44pt, the minimum touch target; it sits in the card corner so the
  // bigger hit area doesn't push the card's content around.
  menuButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: { marginTop: 12, gap: 12 },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,46,37,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 8,
    width: 220,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuItemText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 20,
    width: '85%',
    maxWidth: 360,
  },
  confirmTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  confirmBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  confirmButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDestructive: {
    backgroundColor: colors.destructive,
  },
  confirmButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  confirmButtonTextDestructive: {
    color: colors.white,
  },
});
