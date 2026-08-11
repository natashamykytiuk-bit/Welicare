import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
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
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  formatOrgCode,
  joinOrganizationByCode,
  upgradePersonalOrganization,
} from '../utils/inviteCode';

// Reached from SettingsScreen's "Organization" row, which only shows while
// the caregiver's current org has isPersonal: true — i.e. a Family
// Caregiver still on the auto-created personal org from sign-up (see
// createPersonalOrganization). Once they join or create a real
// organization, this screen just shows that org's join code instead of the
// forms below (loadOrgState re-runs after either action succeeds, so the
// screen naturally flips to that view without a separate "success" state
// to manage).
export default function OrganizationSettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [orgIsPersonal, setOrgIsPersonal] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [orgInviteCode, setOrgInviteCode] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinNote, setJoinNote] = useState('');

  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function loadOrgState() {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    const userSnap = await getDoc(doc(db, 'users', uid));
    const orgId = userSnap.data()?.orgId;
    if (orgId) {
      const orgSnap = await getDoc(doc(db, 'organizations', orgId));
      const data = orgSnap.data();
      setOrgIsPersonal(data?.isPersonal === true);
      setOrgName(data?.name ?? '');
      setOrgInviteCode(data?.inviteCode ?? '');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOrgState();
  }, []);

  function handleChangeJoinCode(text) {
    setJoinCode(formatOrgCode(text));
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoinError('');
    setJoining(true);
    try {
      await joinOrganizationByCode(joinCode);
      setJoinNote(
        "You've joined the organization. Note: any residents or library entries from your personal organization won't be visible under it."
      );
      setJoinCode('');
      await loadOrgState();
    } catch (e) {
      setJoinError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    setCreateError('');
    setCreating(true);
    try {
      await upgradePersonalOrganization({ name });
      setCreateName('');
      await loadOrgState();
    } catch (e) {
      setCreateError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Organization</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : !orgIsPersonal ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Your organization</Text>
            <Text style={styles.orgName}>{orgName || '—'}</Text>
            <Text style={[styles.cardLabel, styles.joinCodeLabel]}>Join code</Text>
            <Text style={styles.joinCode} selectable>
              {orgInviteCode || '—'}
            </Text>
            <Text style={styles.helpText}>Share this code so colleagues can join your organization.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.body}>
              You're currently on a personal organization. Join a colleague's organization with their code, or
              create your own to invite others.
            </Text>

            <Text style={styles.sectionLabel}>Join an Organization</Text>
            <View style={styles.card}>
              {joinNote ? <Text style={styles.note}>{joinNote}</Text> : null}
              {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
              <TextInput
                style={styles.input}
                placeholder="e.g. MG-4821"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={7}
                value={joinCode}
                onChangeText={handleChangeJoinCode}
                accessibilityLabel="Organization join code"
              />
              <TouchableOpacity
                style={[styles.button, (!joinCode.trim() || joining) && styles.buttonDisabled]}
                onPress={handleJoin}
                disabled={!joinCode.trim() || joining}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Join organization"
              >
                <Text style={styles.buttonText}>{joining ? 'Joining…' : 'Join'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Create an Organization</Text>
            <View style={styles.card}>
              <Text style={styles.helpText}>
                Creating an organization gives you a join code to share with colleagues, so you can all work
                from the same shared residents and music library.
              </Text>
              {createError ? <Text style={styles.error}>{createError}</Text> : null}
              <TextInput
                style={styles.input}
                placeholder="Organization name"
                placeholderTextColor={colors.textMuted}
                value={createName}
                onChangeText={setCreateName}
                accessibilityLabel="Organization name"
              />
              <TouchableOpacity
                style={[styles.button, (!createName.trim() || creating) && styles.buttonDisabled]}
                onPress={handleCreate}
                disabled={!createName.trim() || creating}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create organization"
              >
                <Text style={styles.buttonText}>{creating ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: 8,
    marginBottom: 16,
  },
  spinner: { marginTop: 24 },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 24,
  },
  cardLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  joinCodeLabel: { marginTop: 16 },
  orgName: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  joinCode: {
    fontFamily: fonts.serifBold,
    fontSize: 32,
    letterSpacing: 2,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  helpText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 14,
    lineHeight: 20,
  },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.destructive,
    marginBottom: 12,
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
    marginBottom: 14,
    minHeight: 52,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 16,
  },
});
