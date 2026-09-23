import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hasAnyLifeStoryData } from '../utils/lifeStory';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

function initialsOf(name) {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// Caregiver Mode's "My Residents" — reached from CaregiverModeScreen.
// Shows every resident in the caregiver's organization (facilityId match),
// not just the ones on their own Resident Mode list, so staff can keep any
// resident's name and life story up to date. Tapping a resident opens
// BuildProfileScreen, which already edits both the name and the
// questionnaire; returnTo brings them back here after saving.
//
// Saving works for any resident in the org because firestore.rules lets a
// Caregiver/Administrator in the same facility update `name` and
// `lifeStory` (only those fields) even when they aren't assigned.
//
// A caregiver with no organization (skipped that onboarding step) falls
// back to the residents they're assigned to, since there's no facility to
// list.
export default function CaregiverResidentsScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [orgName, setOrgName] = useState('');
  const [hasOrg, setHasOrg] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadResidents = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setError('');
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const orgId = userSnap.data()?.orgId;
      setHasOrg(!!orgId);
      if (orgId) {
        const orgSnap = await getDoc(doc(db, 'organizations', orgId));
        setOrgName(orgSnap.data()?.name ?? '');
      }
      // Two different query shapes because each has to match its own
      // `allow list` rule on its own (see the residents rules).
      const q = orgId
        ? query(collection(db, 'residents'), where('facilityId', '==', orgId))
        : query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid));
      const snapshot = await withTimeout(
        getDocs(q),
        LOAD_TIMEOUT_MS,
        'Loading residents is taking longer than expected. Please check your connection and try again.'
      );
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      setResidents(list);
    } catch (e) {
      console.error('[CaregiverResidents] failed to load residents:', e.code, e.message, e);
      setError(e.code ? 'Could not load residents. Please try again.' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on focus so a name edited in BuildProfile shows up straight away
  // when coming back — same pattern as ResidentModeScreen.
  useFocusEffect(
    useCallback(() => {
      loadResidents();
    }, [loadResidents])
  );

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} />
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.heading}>My Residents</Text>
        <Text style={styles.body}>
          {hasOrg
            ? `Everyone at ${orgName || 'your organization'}. Tap a resident to edit their name or life story.`
            : 'Residents on your list. Tap a resident to edit their name or life story.'}
        </Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : residents.length === 0 && !error ? (
          <Text style={styles.emptyText}>
            No residents yet. Add one from Resident Mode and they'll appear here.
          </Text>
        ) : (
          <FlatList
            data={residents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const profileStarted = hasAnyLifeStoryData(item.lifeStory);
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() =>
                    navigation.navigate('BuildProfile', {
                      residentId: item.id,
                      returnTo: 'CaregiverResidents',
                    })
                  }
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${profileStarted ? 'profile started' : 'profile not started'}. Edit profile`}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name || 'Unnamed resident'}
                    </Text>
                    {/* Flags residents whose questionnaire is still empty,
                        so staff can see at a glance who needs one. */}
                    <Text style={[styles.rowStatus, !profileStarted && styles.rowStatusTodo]}>
                      {profileStarted ? 'Life story started' : 'Life story not started'}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, paddingTop: 24 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
    marginBottom: 20,
    lineHeight: 22,
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
  loading: { marginTop: 40 },
  emptyText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
    marginTop: 20,
  },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    minHeight: 64,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.white,
  },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  rowStatus: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Error red, so residents still missing a life story stand out in the list.
  rowStatusTodo: { color: colors.destructive },
});
