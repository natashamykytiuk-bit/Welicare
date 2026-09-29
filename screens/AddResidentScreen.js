import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import PhotoPickerCircle from '../components/PhotoPickerCircle';
import ResidentAvatar from '../components/ResidentAvatar';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { pickResidentPhoto, setResidentPhoto } from '../utils/profilePhotos';
import { isTimeoutError, withTimeout } from '../utils/withTimeout';

// How long the "photo didn't upload" note stays up before carrying on.
const PHOTO_NOTICE_MS = 3500;

const CREATE_TIMEOUT_MS = 10000;
// How long to wait for the server when double-checking a slow save.
const CHECK_TIMEOUT_MS = 10000;

// Reached two ways: from Caregiver Mode's quick links, and from
// ResidentModeScreen's "Add Resident" option. Captures a name and creates a
// resident doc — the rest of the profile is filled in later via
// BuildProfileScreen. Goes back to wherever it was opened from rather than
// assuming a specific destination screen.
//
// If the signed-in user is a Caregiver or Administrator in an organization,
// they're shown a chooser
// first: create a brand-new resident, or pick one already shared by someone
// else at the same facility (via SelectOrganizationResidentScreen). Users
// with no organization skip straight to the form, unchanged from before.
export default function AddResidentScreen({ navigation }) {
  const [orgId, setOrgId] = useState(undefined); // undefined = loading, null = no org
  const [orgName, setOrgName] = useState('');
  // Only Caregivers and Administrators may add themselves to an existing
  // resident (firestore.rules refuses it for anyone else), so only they get
  // the chooser — everyone else goes straight to the new-resident form.
  const [canSelectFromOrg, setCanSelectFromOrg] = useState(false);
  const [mode, setMode] = useState(null); // null = show chooser (if org exists), 'new' = show form

  const [name, setName] = useState('');
  // Optional profile photo, picked and resized locally; only uploaded
  // after the resident doc exists (see finishSuccess).
  const [photo, setPhoto] = useState(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  // True once the resident is saved and we're only waiting to leave.
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A failed load must NOT fall back to "no organization": the resident
  // would then be created with facilityId null, outside the caregiver's
  // facility. So failure shows LoadError (with Try again) instead of the
  // form. reloadKey re-runs the effect.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Guards setState after each await if the user backs out first.
    let cancelled = false;
    async function loadOrg() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        if (!cancelled) setOrgId(null);
        return;
      }
      setLoadError(false);
      setOrgId(undefined);
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const id = userSnap.data()?.orgId ?? null;
        const role = userSnap.data()?.role;
        let nameForOrg = '';
        if (id) {
          const orgSnap = await getDoc(doc(db, 'organizations', id));
          nameForOrg = orgSnap.data()?.name || 'your organization';
        }
        if (cancelled) return;
        setOrgName(nameForOrg);
        setCanSelectFromOrg(role === 'Caregiver' || role === 'Administrator');
        setOrgId(id);
      } catch (e) {
        console.error('[AddResident] failed to load organization:', e.code, e.message, e);
        if (!cancelled) setLoadError(true);
      }
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // The new resident's document reference, generated ONCE per visit to
  // this form (doc() with no id just invents a random id locally — nothing
  // is written yet). Every save attempt, including retries, writes to this
  // same id with setDoc, so a retry can only ever overwrite the resident
  // it was trying to create, never add a second one. That's what makes the
  // save "idempotent": doing it twice has the same effect as doing it once.
  const residentRef = useRef(null);
  function getResidentRef() {
    if (!residentRef.current) residentRef.current = doc(collection(db, 'residents'));
    return residentRef.current;
  }
  // True once a save has been sent, so later attempts check the server
  // first (see handleCreate).
  const attemptedRef = useRef(false);
  // Shown while a slow save is being double-checked ("taking longer…").
  const [notice, setNotice] = useState('');
  // Avoids setState after navigation.goBack() has unmounted the screen.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // Asks the SERVER (not the local cache) whether the resident exists.
  // getDocFromServer matters: while offline, Firestore keeps pending writes
  // in a local queue, and a plain getDoc would "find" the resident there
  // even though the server never received it.
  // A resident that doesn't exist comes back as permission-denied rather
  // than "missing" (the read rule needs the doc's caregiverId), so that's
  // treated as "not there". Returns true / false, or null if the server
  // couldn't be reached to find out.
  async function existsOnServer(ref) {
    try {
      const snap = await withTimeout(getDocFromServer(ref), CHECK_TIMEOUT_MS);
      return snap.exists();
    } catch (e) {
      if (e.code === 'permission-denied') return false;
      console.error(
        '[AddResident] could not check whether resident was saved:',
        e.code,
        e.message,
        e
      );
      return null;
    }
  }

  // Called once the resident doc is confirmed saved. The photo goes up
  // only now: storage.rules read the resident doc to decide who may upload
  // its photo, so it has to exist first. A failed photo never undoes the
  // resident — we say so gently and carry on back to resident selection;
  // the photo can be added later from their profile.
  async function finishSuccess(id) {
    if (photo) {
      try {
        await setResidentPhoto(id, photo);
      } catch (e) {
        console.error(
          '[AddResident] resident saved but photo upload failed:',
          e.code,
          e.message,
          e
        );
        if (mountedRef.current) {
          // Keeps the button disabled while the note is showing.
          setFinished(true);
          setNotice("Resident saved — the photo didn't upload. You can add it from their profile.");
          setTimeout(() => mountedRef.current && navigation.goBack(), PHOTO_NOTICE_MS);
        }
        return;
      }
    }
    navigation.goBack();
  }

  async function choosePhoto() {
    setPickingPhoto(true);
    try {
      const picked = await pickResidentPhoto();
      if (picked && mountedRef.current) setPhoto(picked);
    } catch (e) {
      console.error('[AddResident] photo pick failed:', e);
      if (mountedRef.current) setError(e.message || "That photo couldn't be opened.");
    } finally {
      if (mountedRef.current) setPickingPhoto(false);
    }
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    setNotice('');
    setSaving(true);
    const uid = auth.currentUser?.uid;
    const ref = getResidentRef();
    try {
      // A retry after an uncertain save: the first attempt may have landed
      // since. Check before writing, because writing the whole doc again
      // counts as an *update*, which firestore.rules only allow for profile
      // fields — so the retry would be refused rather than harmlessly
      // overwrite. If it's already there, we're done.
      if (attemptedRef.current && (await existsOnServer(ref)) === true) {
        await finishSuccess(ref.id);
        return;
      }
      attemptedRef.current = true;
      await withTimeout(
        setDoc(ref, {
          name: trimmed,
          // caregiverId is what firestore.rules checks on create; createdBy
          // is kept alongside it so existing delete/edit-permission checks
          // (and any resident created before this pass) keep working.
          caregiverId: uid,
          createdBy: uid,
          facilityId: orgId ?? null,
          assignedCaregivers: [uid],
          createdAt: serverTimestamp(),
          // The life story itself is saved later, into its own private doc
          // (see utils/residentLifeStory.js); this just marks it as not
          // started for the "complete their profile" prompts.
          hasLifeStory: false,
          // Which backend Music search hits for this resident. Only
          // 'youtube' exists today; keeping it as a named field (rather than
          // assuming YouTube everywhere) means Spotify/Apple Music can be
          // added later as alternate values without restructuring the doc.
          musicProvider: 'youtube',
        }),
        CREATE_TIMEOUT_MS
      );
      await finishSuccess(ref.id);
    } catch (e) {
      if (isTimeoutError(e)) {
        // Slow, not failed: the write may still land (withTimeout doesn't
        // cancel it). Say so, then ask the server what actually happened.
        console.warn('[AddResident] save timed out; checking whether it landed', ref.id);
        if (mountedRef.current)
          setNotice('This is taking longer than usual… checking whether the resident was saved.');
        const exists = await existsOnServer(ref);
        if (exists === true) {
          await finishSuccess(ref.id);
          return;
        }
        if (mountedRef.current) {
          setNotice('');
          setError(
            "We couldn't confirm the resident was saved. Please check your connection and tap Try again — it won't create a duplicate."
          );
        }
      } else if (e.code === 'permission-denied' && (await existsOnServer(ref)) === true) {
        // The resident landed between our check and this write, so the
        // write was refused as an update. It's saved — carry on.
        await finishSuccess(ref.id);
        return;
      } else {
        console.error('[AddResident] resident creation failed:', e.code, e.message, e);
        if (mountedRef.current) {
          setError('Something went wrong creating this resident. Please try again.');
        }
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const showChooser = orgId && canSelectFromOrg && mode !== 'new';

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <BackButton navigation={navigation} />

        {loadError ? (
          <LoadError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : orgId === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : showChooser ? (
          <>
            <Text style={styles.heading}>Add a resident</Text>
            <Text style={styles.body}>
              Create a brand-new profile, or add a resident someone else at your organization has
              already set up.
            </Text>

            <TouchableOpacity
              style={styles.card}
              onPress={() => setMode('new')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add New Resident"
            >
              <Ionicons
                name="person-add-outline"
                size={28}
                color={colors.primary}
                style={styles.cardIcon}
              />
              <Text style={styles.cardTitle}>Add New Resident</Text>
              <Text style={styles.cardBody}>Create a brand-new resident profile.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('SelectOrganizationResident', { orgId, orgName })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Select from ${orgName}`}
            >
              <Ionicons
                name="people-outline"
                size={28}
                color={colors.primary}
                style={styles.cardIcon}
              />
              <Text style={styles.cardTitle}>Select from {orgName}</Text>
              <Text style={styles.cardBody}>
                Add a resident already shared by your organization.
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Add a resident</Text>
            <Text style={styles.body}>Create a new resident profile.</Text>

            {error ? (
              <Text style={styles.errorBanner} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}

            {/* Optional photo, at the top of the form. */}
            <PhotoPickerCircle
              avatar={<ResidentAvatar name={name || '?'} size={96} />}
              previewUri={photo?.uri}
              hasPhoto={!!photo}
              busy={pickingPhoto}
              onPick={choosePhoto}
              onRemove={() => setPhoto(null)}
            />

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Resident's full name"
              placeholderTextColor={colors.textMuted}
              // Same cap as firestore.rules (validResidentFields).
              maxLength={200}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, (!name.trim() || saving || finished) && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || saving || finished}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={attemptedRef.current && error ? 'Try again' : 'Create resident'}
            >
              {/* After an uncertain or failed save the same button retries
                  (with the same resident id), so it's labelled Try again. */}
              <Text style={styles.buttonText}>
                {saving
                  ? 'Creating…'
                  : attemptedRef.current && error
                    ? 'Try again'
                    : 'Create resident'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, paddingTop: 24 },
  loading: { marginTop: 40 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 24,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  cardIcon: { marginBottom: 10 },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 20,
  },
  // Calm, non-error styling for the "taking longer than usual" message.
  noticeBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.primary,
    fontSize: 15,
    padding: 14,
    marginBottom: 20,
    lineHeight: 21,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 15,
    padding: 14,
    marginBottom: 20,
    lineHeight: 21,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
  },
});
