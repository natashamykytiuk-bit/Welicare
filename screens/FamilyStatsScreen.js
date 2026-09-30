import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import ResidentAvatar from '../components/ResidentAvatar';
import { PeriodPicker, TimeBar, visits } from '../components/StatsParts';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  PERIODS,
  formatDuration,
  loadResidentSessions,
  summarizeSessions,
} from '../utils/engagementStats';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 15000;

// Family Mode → Activity: a view-only look at how each resident the family
// member is linked to has been spending time in Resident Mode — total time
// and time per activity over the chosen period. Nothing here can be changed.
//
// Residents come from the same three queries as FamilyResidentsScreen
// (created by / assigned to / linked by family code); each one's sessions
// are then loaded with a residentId filter, which firestore.rules allow for
// anyone linked to that resident, and nobody else's.
//
// One resident failing to load doesn't hide the others: it just shows a
// short note in its own card.
export default function FamilyStatsScreen({ navigation }) {
  // undefined while loading, then [{ resident, sessions, failed }].
  const [rows, setRows] = useState(undefined);
  const [period, setPeriod] = useState('30d');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoadError(false);
    try {
      const residentsCol = collection(db, 'residents');
      const [owned, assigned, family] = await withTimeout(
        Promise.all([
          getDocs(query(residentsCol, where('createdBy', '==', uid))),
          getDocs(query(residentsCol, where('assignedCaregivers', 'array-contains', uid))),
          getDocs(query(residentsCol, where('familyMembers', 'array-contains', uid))),
        ]),
        LOAD_TIMEOUT_MS,
        'timeout'
      );
      const merged = new Map();
      [...owned.docs, ...assigned.docs, ...family.docs].forEach((d) =>
        merged.set(d.id, { id: d.id, ...d.data() })
      );
      const residents = [...merged.values()].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '')
      );
      const results = await Promise.allSettled(
        residents.map((r) => loadResidentSessions(r.facilityId ?? null, r.id))
      );
      setRows(
        residents.map((resident, i) => {
          const result = results[i];
          if (result.status === 'rejected') {
            console.error('[FamilyStats] failed to load sessions for', resident.id, result.reason);
          }
          return {
            resident,
            sessions: result.status === 'fulfilled' ? result.value : [],
            failed: result.status === 'rejected',
          };
        })
      );
    } catch (e) {
      console.error('[FamilyStats] failed to load residents:', e.code, e.message, e);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = PERIODS.find((p) => p.key === period) ?? PERIODS[1];

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Activity</Text>

        {loadError ? (
          <LoadError onRetry={load} />
        ) : rows === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : rows.length === 0 ? (
          <Text style={styles.body}>
            You’re not linked to any residents yet. Ask their care team for a family code, then
            enter it in My Residents.
          </Text>
        ) : (
          <>
            <Text style={styles.body}>
              Time your loved ones have spent in activities like music, games and the photo album.
            </Text>
            <PeriodPicker value={period} onChange={setPeriod} />

            {rows.map(({ resident, sessions, failed }) => {
              const summary = summarizeSessions(sessions, { days: selected.days });
              const longest = summary.activities[0]?.seconds ?? 0;
              const name = resident.preferredName || resident.name || 'Resident';
              return (
                <View key={resident.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <ResidentAvatar
                      name={resident.name}
                      photoPath={resident.photoPath}
                      photoUpdatedAt={resident.photoUpdatedAt}
                      size={48}
                    />
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.name}>{name}</Text>
                      {!failed ? (
                        <Text style={styles.total}>
                          {`${formatDuration(summary.totalSeconds)} in activities`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {failed ? (
                    <Text style={styles.muted}>
                      Activity time couldn’t be loaded just now. Please try again later.
                    </Text>
                  ) : summary.activities.length === 0 ? (
                    <Text style={styles.muted}>No activity recorded in this period.</Text>
                  ) : (
                    summary.activities.map((a) => (
                      <TimeBar
                        key={a.activityId}
                        label={a.label}
                        seconds={a.seconds}
                        max={longest}
                        meta={`${visits(a.sessions)} · last ${a.lastPlayedAt.toLocaleDateString()}`}
                      />
                    ))
                  )}
                </View>
              );
            })}
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
    marginTop: 16,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 23,
    marginBottom: 20,
  },
  spinner: { marginTop: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 20,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardHeaderText: { flex: 1 },
  name: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.textPrimary },
  total: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.primary, marginTop: 2 },
  muted: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginTop: 12,
  },
});
