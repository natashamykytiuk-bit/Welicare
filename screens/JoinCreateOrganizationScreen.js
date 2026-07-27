import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Shown once during onboarding, after PINSetupScreen, for every role.
// Role isn't threaded through as a navigation param — this screen is
// reached via App.js's onboarding-status-driven initialRouteName (not a
// `navigate` call), so route params wouldn't survive the hop. Instead we
// read the role the same way ModeSelectionScreen does: straight from the
// user's own Firestore doc, which SignUpScreen already wrote at account
// creation.
//
// Administrators must connect to an organization before continuing (they
// manage staff/residents at the org level, so a facility-less admin account
// isn't useful) — everyone else can skip and connect later from Settings.
export default function JoinCreateOrganizationScreen({ navigation }) {
  // undefined while loading, then either the role string or null
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      if (!cancelled) setRole(snap.data()?.role ?? null);
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdministrator = role === 'Administrator';

  // Skipping is recorded on the user's own doc (not just a navigation
  // shortcut) so App.js's onboarding-status check treats it as a durable
  // decision — otherwise the user would land back on this screen on every
  // future sign-in since they'd still lack an orgId.
  async function handleSkip() {
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await setDoc(doc(db, 'users', uid), { orgStepSkipped: true }, { merge: true });
      } catch (e) {
        console.log('Failed to record org step skip:', e);
      }
    }
    navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.stepIndicator}>STEP 3 OF 3</Text>
        <Text style={styles.heading}>Join or create an organization</Text>
        <Text style={styles.body}>
          {isAdministrator
            ? 'As an administrator, connect to your care facility to continue — this step can’t be skipped.'
            : 'Connect to your care facility to start using Welicare.'}
        </Text>

        {role === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : (
          <>
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('JoinOrganization')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Join an organization"
            >
              <Ionicons name="business-outline" size={28} color={colors.primary} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>Join an organization</Text>
              <Text style={styles.cardBody}>Enter the invite code your administrator sent you.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CreateOrganization')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create an organization"
            >
              <Ionicons name="people-outline" size={28} color={colors.primary} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>Create an organization</Text>
              <Text style={styles.cardBody}>Set up a new Welicare facility for your care home.</Text>
            </TouchableOpacity>

            {!isAdministrator ? (
              <TouchableOpacity
                style={styles.skipLink}
                onPress={handleSkip}
                accessibilityRole="link"
                accessibilityLabel="Skip this step"
              >
                <Text style={styles.skipLinkText}>Skip this step →</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 56, paddingBottom: 48 },
  stepIndicator: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
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
    marginBottom: 28,
  },
  loading: { marginTop: 40 },
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
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  skipLinkText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textMuted,
  },
});
