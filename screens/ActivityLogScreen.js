import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// How many of the most recent entries are shown.
const ENTRY_LIMIT = 100;

// Administrator Mode → Activity log: the organization's recent sensitive
// changes (members joining, leaving or being removed, the administrator
// role moving, invite codes replaced, residents deleted, the volunteer
// permission changing), newest first. Entries are written only by Cloud
// Functions (functions/auditLog.js) and firestore.rules let only this
// organization's Administrators read them.
//
// Read-only: there is nothing to edit or delete here, by design.
export default function ActivityLogScreen({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Guards setState after the awaits if the user backs out first.
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const orgId = (await getDoc(doc(db, 'users', auth.currentUser?.uid ?? '-'))).data()?.orgId;
        if (!orgId) {
          if (!cancelled) setEntries([]);
          return;
        }
        // where + orderBy needs the composite index on (orgId, at desc) in
        // firestore.indexes.json. The orgId filter must be there anyway: the
        // rules only allow reading your own organization's entries.
        const snap = await getDocs(
          query(
            collection(db, 'auditLog'),
            where('orgId', '==', orgId),
            orderBy('at', 'desc'),
            limit(ENTRY_LIMIT)
          )
        );
        if (!cancelled) setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('[ActivityLog] failed to load:', e.code, e.message);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <SafeAreaView style={styles.flex}>
      <FlatList
        data={loading || loadError ? [] : entries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <BackButton navigation={navigation} />
            <Text style={styles.heading}>Activity log</Text>
            <Text style={styles.body}>
              Recent changes to members, residents and permissions in your organization. Only
              administrators can see this.
            </Text>
            {loadError ? <LoadError onRetry={() => setReloadKey((k) => k + 1)} /> : null}
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
            ) : null}
            {!loading && !loadError && entries.length === 0 ? (
              <Text style={styles.empty}>Nothing has been recorded yet.</Text>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.sentence}>{describeEntry(item)}</Text>
            <Text style={styles.when}>{formatWhen(item.at)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

// One plain sentence per entry. Names were captured when the entry was
// written, so they still read correctly after someone leaves or a resident
// is deleted. Exported for tests.
export function describeEntry(entry) {
  const who = entry.actorName || 'Someone';
  const whom = entry.targetName || 'a member';
  switch (entry.action) {
    case 'member.joined':
      return `${who} joined the organization.`;
    case 'member.requested':
      return `${who} asked to join the organization.`;
    case 'member.approved':
      return `${who} approved ${whom}'s request to join.`;
    case 'member.denied':
      return `${who} declined ${whom}'s request to join.`;
    case 'member.removed':
      return `${who} removed ${whom} from the organization.`;
    case 'member.left':
      return `${who} deleted their account and left the organization.`;
    case 'admin.transferred':
      return `${who} made ${whom} the organization's administrator.`;
    case 'inviteCode.regenerated':
      return `${who} replaced the invite code.`;
    case 'resident.deleted':
      return `${who} deleted the resident ${entry.targetName || '(unnamed)'}.`;
    case 'volunteerPermissions.changed':
      return `${who} changed volunteer permissions: ${entry.detail || 'updated'}.`;
    // Family codes (functions/index.js): `detail` holds the resident's name.
    case 'familyCode.created':
      return `${who} created a family code for ${entry.detail || 'a resident'}.`;
    case 'family.linked':
      return `${who} used a family code to link to ${entry.detail || 'a resident'}.`;
    case 'family.unlinked':
      return `${who} removed ${entry.targetName || 'a family member'}'s access to ${entry.detail || 'a resident'}.`;
    default:
      return `${who}: ${entry.action}`;
  }
}

// "12 Mar 2026, 14:05" in the device's locale; the server timestamp can be
// briefly missing on a just-written entry.
function formatWhen(at) {
  const date = at?.toDate ? at.toDate() : null;
  return date
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Just now';
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
    lineHeight: 24,
    marginBottom: 20,
  },
  spinner: { marginTop: 24 },
  empty: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  sentence: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  when: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
});
