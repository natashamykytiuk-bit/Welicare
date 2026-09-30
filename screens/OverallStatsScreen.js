import { useFocusEffect } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
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
import { PeriodPicker, StatTiles, TimeBar, visits } from '../components/StatsParts';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  PERIODS,
  formatDuration,
  loadFacilitySessions,
  summarizeFacility,
} from '../utils/engagementStats';
import { withTimeout } from '../utils/withTimeout';

const LOAD_TIMEOUT_MS = 15000;

// Caregiver Mode → Overall Stats: engagement across the whole facility, from
// the activitySessions log that Resident Mode writes (utils/activitySessions.js).
// Over the chosen period it shows total time, visits and how many residents
// took part; time per activity; and time per resident — every resident is
// listed, with those who haven't had a visit last, so staff can see who
// might enjoy one. Tapping a resident opens their profile.
//
// The facility's sessions and residents are loaded once (on focus) and
// summarised client-side for each period (summarizeFacility), so switching
// periods is instant. Both queries filter on facilityId == the user's org,
// which is what firestore.rules require for staff to list them.
export default function OverallStatsScreen({ navigation }) {
  // undefined while loading; null when the user has no organization.
  const [orgId, setOrgId] = useState(undefined);
  const [sessions, setSessions] = useState([]);
  const [residents, setResidents] = useState([]);
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
      const [logged, residentSnap] = await withTimeout(
        Promise.all([
          loadFacilitySessions(id),
          getDocs(query(collection(db, 'residents'), where('facilityId', '==', id))),
        ]),
        LOAD_TIMEOUT_MS,
        'timeout'
      );
      setSessions(logged);
      setResidents(residentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setOrgId(id);
    } catch (e) {
      console.error('[OverallStats] failed to load stats:', e.code, e.message, e);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = PERIODS.find((p) => p.key === period) ?? PERIODS[1];
  const summary = summarizeFacility(sessions, residents, { days: selected.days });
  const longestActivity = summary.activities[0]?.seconds ?? 0;
  const longestResident = summary.residents[0]?.seconds ?? 0;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Overall Stats</Text>

        {loadError ? (
          <LoadError onRetry={load} />
        ) : orgId === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : orgId === null ? (
          <Text style={styles.body}>
            Stats are recorded for organizations. Join or create one to see them here.
          </Text>
        ) : (
          <>
            <Text style={styles.body}>
              Time residents spent in Resident Mode activities across your organization.
            </Text>
            <PeriodPicker value={period} onChange={setPeriod} />

            <StatTiles
              tiles={[
                { label: 'Total time', value: formatDuration(summary.totalSeconds) },
                { label: 'Visits', value: String(summary.sessions) },
                {
                  label: 'Residents taking part',
                  value: `${summary.residentsEngaged} of ${summary.residents.length}`,
                },
              ]}
            />

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>By activity</Text>
              {summary.activities.length === 0 ? (
                <Text style={styles.muted}>No activity recorded in this period.</Text>
              ) : (
                summary.activities.map((a) => (
                  <TimeBar
                    key={a.activityId}
                    label={a.label}
                    seconds={a.seconds}
                    max={longestActivity}
                    meta={visits(a.sessions)}
                  />
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>By resident</Text>
              {summary.residents.length === 0 ? (
                <Text style={styles.muted}>No residents in your organization yet.</Text>
              ) : (
                summary.residents.map((r) => (
                  <TouchableOpacity
                    key={r.residentId}
                    onPress={() =>
                      navigation.navigate('ResidentProfile', { residentId: r.residentId })
                    }
                    accessibilityRole="button"
                    accessibilityHint="Opens this resident's profile"
                  >
                    <TimeBar
                      label={r.name}
                      seconds={r.seconds}
                      max={longestResident}
                      meta={
                        r.sessions === 0
                          ? 'No visits in this period'
                          : `${visits(r.sessions)} · last ${r.lastActiveAt.toLocaleDateString()}`
                      }
                    />
                  </TouchableOpacity>
                ))
              )}
            </View>

            {summary.guestSessions > 0 ? (
              <Text style={styles.muted}>
                {`Guest Mode: ${formatDuration(summary.guestSeconds)} over ${visits(summary.guestSessions)} (not linked to a resident, included in the total above).`}
              </Text>
            ) : null}
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
});
