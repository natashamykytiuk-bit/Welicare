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
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import ResidentAvatar from '../components/ResidentAvatar';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;

// Family Mode's "My Residents" — reached from FamilyModeScreen.
//
// For now this only lists the residents the family member is linked to
// (ones they created, or were added to via assignedCaregivers) with an
// "Add Photos" button each, for the Resident Mode photo album. The rest of
// the screen (updates, visit notes, …) is still to be designed, hence the
// "Coming soon" note underneath.
//
// Two single-field queries merged client-side, same as ResidentModeScreen:
// each has to match its own `allow list` branch in firestore.rules, and a
// Family Caregiver can't list the whole facility.
export default function FamilyResidentsScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFailed(false);
    try {
      const [owned, assigned] = await withTimeout(
        Promise.all([
          getDocs(query(collection(db, 'residents'), where('createdBy', '==', uid))),
          getDocs(
            query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid))
          ),
        ]),
        LOAD_TIMEOUT_MS,
        'timeout'
      );
      const merged = new Map();
      [...owned.docs, ...assigned.docs].forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
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
            You aren't linked to any residents yet. Ask their care team to add you.
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
