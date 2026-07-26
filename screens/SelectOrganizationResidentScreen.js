import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
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
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 10000;
const ASSIGN_TIMEOUT_MS = 10000;

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// Reached from AddResidentScreen's "Select from [Organization]" card.
// Lists residents already shared at this facility (facilityId match) that
// the current user hasn't already added to their own list, and lets them
// self-assign to one via arrayUnion on assignedCaregivers — the write
// firestore.rules permits specifically for this case (see the residents
// update rule's self-assignment branch).
export default function SelectOrganizationResidentScreen({ navigation, route }) {
  const { orgId, orgName } = route.params ?? {};
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadResidents() {
      setLoading(true);
      setError('');
      const uid = auth.currentUser?.uid;
      console.log('[SelectOrgResident] loading residents for facility', orgId);
      try {
        const snapshot = await withTimeout(
          getDocs(query(collection(db, 'residents'), where('facilityId', '==', orgId))),
          LOAD_TIMEOUT_MS,
          'Loading residents is taking longer than expected. Please check your connection and try again.'
        );
        if (cancelled) return;
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const selectable = all.filter((r) => {
          const isOwner = r.caregiverId === uid || r.createdBy === uid;
          const isAssigned = Array.isArray(r.assignedCaregivers) && r.assignedCaregivers.includes(uid);
          return !isOwner && !isAssigned;
        });
        console.log('[SelectOrgResident] found', selectable.length, 'selectable residents');
        setResidents(selectable);
      } catch (e) {
        console.error('[SelectOrgResident] failed to load residents:', e.code, e.message, e);
        setError(e.code ? 'Could not load residents. Please try again.' : e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadResidents();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleSelect(resident) {
    const uid = auth.currentUser?.uid;
    setError('');
    setAssigningId(resident.id);
    console.log('[SelectOrgResident] assigning resident', resident.id, 'to', uid);
    try {
      await withTimeout(
        updateDoc(doc(db, 'residents', resident.id), { assignedCaregivers: arrayUnion(uid) }),
        ASSIGN_TIMEOUT_MS,
        'This is taking longer than expected. Please check your connection and try again.'
      );
      console.log('[SelectOrgResident] assigned resident', resident.id);
      navigation.navigate('ResidentMode');
    } catch (e) {
      console.error('[SelectOrgResident] assignment failed:', e.code, e.message, e);
      setError(e.code ? 'Could not add this resident. Please try again.' : e.message);
      setAssigningId(null);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Select from {orgName || 'your organization'}</Text>
        <Text style={styles.body}>Tap a resident to add them to your list.</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : residents.length === 0 ? (
          <Text style={styles.emptyText}>
            There are no other residents at {orgName || 'your organization'} to add yet.
          </Text>
        ) : (
          <FlatList
            data={residents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleSelect(item)}
                disabled={assigningId === item.id}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
                </View>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {assigningId === item.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, paddingTop: 24 },
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
  rowName: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
});
