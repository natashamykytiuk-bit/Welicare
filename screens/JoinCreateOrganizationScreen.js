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
import LoadError from '../components/LoadError';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { createPersonalOrganization } from '../utils/inviteCode';

// Shown once during onboarding, after PINSetupScreen, for every role.
// Role isn't threaded through as a navigation param — this screen is
// reached via App.js's onboarding-status-driven initialRouteName (not a
// `navigate` call), so route params wouldn't survive the hop. Instead we
// read the role the same way ModeSelectionScreen does: straight from the
// user's own Firestore doc, which SignUpScreen already wrote at account
// creation.
//
// Administrators, Caregivers and Volunteers all work for a facility, so an
// account with no organization has nothing for them (see utils/onboarding.js):
// they must join or create one here.
//
// Family Caregivers are different: they never join or create an
// organization (the server refuses both — see joinOrganization and
// createOrganization in functions/index.js). They normally never see this
// screen at all, because sign-up gives them a family organization; they
// only land here if that step failed. So for them the Join/Create cards are
// replaced by a short explanation and a Continue button, which tries once
// more to set up the family organization and carries on either way.
export default function JoinCreateOrganizationScreen({ navigation }) {
  // undefined while loading, then either the role string or null
  const [role, setRole] = useState(undefined);
  // The role decides whether "Skip" is offered, so without it the screen
  // can't safely show its options — a failed load shows LoadError instead.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Guards setState after the await if the user moves on first.
    let cancelled = false;
    async function loadRole() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setLoadError(false);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!cancelled) setRole(snap.data()?.role ?? null);
      } catch (e) {
        console.error('[JoinCreateOrganization] failed to load role:', e.code, e.message, e);
        if (!cancelled) setLoadError(true);
      }
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const isFamily = role === 'Family Caregiver';

  // Skipping is recorded on the user's own doc (not just a navigation
  // shortcut) so App.js's onboarding-status check treats it as a durable
  // decision — otherwise the user would land back on this screen on every
  // future sign-in since they'd still lack an orgId.
  async function handleSkip() {
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Second attempt at what sign-up tried. Best-effort: without it they
      // can still add at-home residents (with no organization), so a
      // failure mustn't keep them on this screen.
      try {
        await createPersonalOrganization();
      } catch (e) {
        console.log('Family organization creation failed again:', e);
      }
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
        <Text style={styles.heading} accessibilityRole="header">
          {isFamily ? 'You’re all set' : 'Join or create an organization'}
        </Text>
        <Text style={styles.body}>
          {isFamily
            ? 'Family accounts don’t join an organization. You can add the person you care for at home, or link to someone in a care home with a family code from their care team — both from inside the app.'
            : 'Connect to your care facility to continue — this step can’t be skipped.'}
        </Text>

        {loadError ? (
          <LoadError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : role === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : isFamily ? (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleSkip}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('JoinOrganization')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Join an organization"
            >
              <Ionicons
                name="business-outline"
                size={28}
                color={colors.primary}
                style={styles.cardIcon}
              />
              <Text style={styles.cardTitle}>Join an organization</Text>
              <Text style={styles.cardBody}>
                Enter the invite code your administrator sent you.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CreateOrganization')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create an organization"
            >
              <Ionicons
                name="people-outline"
                size={28}
                color={colors.primary}
                style={styles.cardIcon}
              />
              <Text style={styles.cardTitle}>Create an organization</Text>
              <Text style={styles.cardBody}>
                Set up a new Welicare facility for your care home.
              </Text>
            </TouchableOpacity>
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
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.white,
  },
});
