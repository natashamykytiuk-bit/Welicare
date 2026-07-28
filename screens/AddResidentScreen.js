import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
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
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { withTimeout } from '../utils/withTimeout';

const CREATE_TIMEOUT_MS = 10000;

// Reached two ways: from Caregiver Mode's quick links, and from
// ResidentModeScreen's "Add Resident" option. Captures a name and creates a
// resident doc — the rest of the profile is filled in later via
// BuildProfileScreen. Goes back to wherever it was opened from rather than
// assuming a specific destination screen.
//
// If the signed-in user belongs to an organization, they're shown a chooser
// first: create a brand-new resident, or pick one already shared by someone
// else at the same facility (via SelectOrganizationResidentScreen). Users
// with no organization skip straight to the form, unchanged from before.
export default function AddResidentScreen({ navigation }) {
  const [orgId, setOrgId] = useState(undefined); // undefined = loading, null = no org
  const [orgName, setOrgName] = useState('');
  const [mode, setMode] = useState(null); // null = show chooser (if org exists), 'new' = show form

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOrg() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        if (!cancelled) setOrgId(null);
        return;
      }
      console.log('[AddResident] checking organization membership for', uid);
      const userSnap = await getDoc(doc(db, 'users', uid));
      const id = userSnap.data()?.orgId ?? null;
      if (cancelled) return;
      setOrgId(id);
      if (id) {
        const orgSnap = await getDoc(doc(db, 'organizations', id));
        if (!cancelled) setOrgName(orgSnap.data()?.name || 'your organization');
      }
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    setSaving(true);
    const uid = auth.currentUser?.uid;
    console.log('[AddResident] creating resident', { name: trimmed, uid, orgId });
    try {
      const docRef = await withTimeout(
        addDoc(collection(db, 'residents'), {
          name: trimmed,
          // caregiverId is what firestore.rules checks on create; createdBy
          // is kept alongside it so existing delete/edit-permission checks
          // (and any resident created before this pass) keep working.
          caregiverId: uid,
          createdBy: uid,
          facilityId: orgId ?? null,
          assignedCaregivers: [uid],
          createdAt: serverTimestamp(),
          lifeStory: null,
          // Which backend Music search hits for this resident. Only
          // 'youtube' exists today; keeping it as a named field (rather than
          // assuming YouTube everywhere) means Spotify/Apple Music can be
          // added later as alternate values without restructuring the doc.
          musicProvider: 'youtube',
        }),
        CREATE_TIMEOUT_MS,
        'Creating this resident is taking longer than expected. Please check your connection and try again.'
      );
      console.log('[AddResident] resident created:', docRef.id);
      navigation.goBack();
    } catch (e) {
      console.error('[AddResident] resident creation failed:', e.code, e.message, e);
      setError(
        e.code
          ? 'Something went wrong creating this resident. Please try again.'
          : e.message
      );
    } finally {
      setSaving(false);
    }
  }

  const showChooser = orgId && mode !== 'new';

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <BackButton navigation={navigation} />

        {orgId === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : showChooser ? (
          <>
            <Text style={styles.heading}>Add a resident</Text>
            <Text style={styles.body}>
              Create a brand-new profile, or add a resident someone else at your
              organization has already set up.
            </Text>

            <TouchableOpacity
              style={styles.card}
              onPress={() => setMode('new')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add New Resident"
            >
              <Ionicons name="person-add-outline" size={28} color={colors.primary} style={styles.cardIcon} />
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
              <Ionicons name="people-outline" size={28} color={colors.primary} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>Select from {orgName}</Text>
              <Text style={styles.cardBody}>Add a resident already shared by your organization.</Text>
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

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Resident's full name"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || saving}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create resident"
            >
              <Text style={styles.buttonText}>{saving ? 'Creating…' : 'Create resident'}</Text>
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
