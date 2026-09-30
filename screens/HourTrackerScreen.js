import { useFocusEffect } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import { PeriodPicker, StatTiles, TimeBar } from '../components/StatsParts';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  PERIODS,
  formatDuration,
  loadUserSessions,
  summarizeVolunteer,
} from '../utils/engagementStats';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 15000;

// Volunteer Mode → Hour Tracker. A volunteer's hours come straight from the
// Resident Mode visits they ran (the activitySessions log, with their own
// userId), so there's nothing to enter by hand and the numbers always match
// what the facility sees in Overall Stats. Shows the chosen period's total,
// visits and residents visited; the last 8 weeks week by week; and the most
// recent visits.
//
// No settings gear — that's only on VolunteerResidentsScreen, per the
// screen-flow diagram this app follows.
export default function HourTrackerScreen({ navigation }) {
  // undefined while loading; null when the volunteer has no organization.
  const [orgId, setOrgId] = useState(undefined);
  const [sessions, setSessions] = useState([]);
  // residentId → name, for the recent-visits list. Volunteers may list
  // their facility's residents (seesWholeFacility in firestore.rules).
  const [names, setNames] = useState({});
  const [period, setPeriod] = useState('30d');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoadError(false);
    try {
      const id = (await getDoc(doc(db, 'users', uid))).data()?.orgId ?? null;
      if (!id) {
        setOrgId(null);
        return;
      }
      const [mine, residentSnap] = await withTimeout(
        Promise.all([
          loadUserSessions(id, uid),
          getDocs(query(collection(db, 'residents'), where('facilityId', '==', id))),
        ]),
        LOAD_TIMEOUT_MS,
        'timeout'
      );
      setSessions(mine);
      setNames(
        Object.fromEntries(
          residentSnap.docs.map((d) => [d.id, d.data().preferredName || d.data().name])
        )
      );
      setOrgId(id);
    } catch (e) {
      console.error('[HourTracker] failed to load hours:', e.code, e.message, e);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = PERIODS.find((p) => p.key === period) ?? PERIODS[1];
  const summary = summarizeVolunteer(sessions, { days: selected.days });
  const busiestWeek = Math.max(0, ...summary.weeks.map((w) => w.seconds));

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Hour Tracker</Text>

        {loadError ? (
          <LoadError onRetry={load} />
        ) : orgId === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : orgId === null ? (
          <Text style={styles.body}>
            Hours are recorded for organizations. Join one to start tracking them.
          </Text>
        ) : (
          <>
            <Text style={styles.body}>
              Your time is counted automatically from the Resident Mode activities you run.
            </Text>
            <PeriodPicker value={period} onChange={setPeriod} />

            <StatTiles
              tiles={[
                { label: 'Time volunteered', value: formatDuration(summary.totalSeconds) },
                { label: 'Visits', value: String(summary.sessions) },
                { label: 'Residents visited', value: String(summary.residentsVisited) },
              ]}
            />

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Week by week</Text>
              {summary.weeks.map((w) => (
                <TimeBar
                  key={w.weekStart.toISOString()}
                  label={`Week of ${w.weekStart.toLocaleDateString()}`}
                  seconds={w.seconds}
                  max={busiestWeek}
                />
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recent visits</Text>
              {summary.recent.length === 0 ? (
                <Text style={styles.muted}>
                  No visits in this period yet. Run an activity in Resident Mode and it’ll show
                  here.
                </Text>
              ) : (
                summary.recent.map((v, i) => (
                  <View
                    key={`${v.startedAt.getTime()}-${i}`}
                    style={[styles.visitRow, i > 0 && styles.visitBorder]}
                    accessible
                  >
                    <View style={styles.visitText}>
                      <Text style={styles.visitTitle}>{v.label}</Text>
                      <Text style={styles.visitMeta}>
                        {[
                          v.residentId ? (names[v.residentId] ?? 'A resident') : 'Guest Mode',
                          v.startedAt.toLocaleDateString(),
                        ].join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.visitTime}>{formatDuration(v.seconds)}</Text>
                  </View>
                ))
              )}
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
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.textPrimary },
  muted: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginTop: 12,
  },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  visitBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  visitText: { flex: 1 },
  visitTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  visitMeta: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  visitTime: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
});
