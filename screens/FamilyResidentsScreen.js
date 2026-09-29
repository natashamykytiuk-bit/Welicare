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
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

// Family Mode's "My Residents" — reached from FamilyModeScreen.
//
// For now this only lists the residents the family member is linked to
// (ones they created, were added to via assignedCaregivers, or linked to
// themselves with a family code — familyMembers) with an "Add Photos" button
// each, for the Resident Mode photo album, plus a box to enter a family code
// from a resident's care team (see utils/familyLinks.js). The rest of the
// screen (updates, visit notes, …) is still to be designed, hence the
// "Coming soon" note underneath.
//
// Three single-field queries merged client-side, same as ResidentModeScreen:
// each has to match its own `allow list` branch in firestore.rules, and a
// Family Caregiver can't list the whole facility.
export default function FamilyResidentsScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
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
        <Text style={styles.body}>Share photos for your loved one's photo album.</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : failed ? (
          <LoadError onRetry={load} />
        ) : residents.length === 0 ? (
          <Text style={styles.body}>
            You aren't linked to any residents yet. Ask their care team for a family code and
            enter it below.
          </Text>
        ) : (
          residents.map((r) => (
            <View key={r.id} style={styles.row}>
              <ResidentAvatar
                name={r.name}
                photoPath={r.photoPath}
                photoUpdatedAt={r.photoUpdatedAt}
                size={44}
              />
              <Text style={styles.rowName} numberOfLines={1}>
                {r.name || 'Unnamed resident'}
              </Text>
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
                accessibilityLabel={`Add photos for ${r.name || 'resident'}`}
              >
                <Ionicons name="images-outline" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Add Photos</Text>
              </TouchableOpacity>
            </View>
          ))
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  rowName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 17, color: colors.textPrimary },
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
