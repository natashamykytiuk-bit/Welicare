import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LoadError from '../components/LoadError';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { cancelJoinRequest } from '../utils/inviteCode';

// Shown while someone waits for an organization's administrator to approve
// the join request they made with its invite code (joinOrganization in
// functions/index.js). App.js lands here on every sign-in while the
// request is waiting (see utils/onboarding.js), so closing the app doesn't
// lose their place.
//
// There's no live listener: approval happens on another device, so "Check
// again" re-reads the user's own doc. Three outcomes:
//   - orgId is set        → approved; reset to ModeSelection.
//   - still pendingOrgId  → still waiting; say so.
//   - neither             → the request was declined (or the organization
//                           was deleted); offer to try another code.
// "Cancel request" clears pendingOrgId — the one change firestore.rules let
// the app make to it — and goes back to the join/create step.
export default function PendingApprovalScreen({ navigation }) {
  // 'loading' | 'waiting' | 'declined'
  const [state, setState] = useState('loading');
  const [orgName, setOrgName] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reads the user's doc and decides which outcome applies. `manual` is a
  // "Check again" tap, which shows a note when nothing has changed yet.
  const check = useCallback(
    async (manual = false) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setLoadError(false);
      setNotice('');
      if (manual) setChecking(true);
      try {
        const data = (await getDoc(doc(db, 'users', uid))).data() ?? {};
        if (data.orgId && !data.pendingOrgId) {
          // Approved: approveOrgMember moves pendingOrgId into orgId.
          navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
          return;
        }
        if (!data.pendingOrgId) {
          setState('declined');
          return;
        }
        // Org docs are readable by id to anyone signed in, which is all the
        // name needs. A failure here just leaves the name out.
        try {
          const org = (await getDoc(doc(db, 'organizations', data.pendingOrgId))).data();
          setOrgName(org?.name ?? '');
        } catch (e) {
          console.log('[PendingApproval] could not load organization name:', e.code);
        }
        setState('waiting');
        if (manual) setNotice('Not approved yet. We’ll keep your request waiting.');
      } catch (e) {
        console.error('[PendingApproval] failed to load request:', e.code, e.message, e);
        setLoadError(true);
      } finally {
        setChecking(false);
      }
    },
    [navigation]
  );

  useEffect(() => {
    check();
  }, [check]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelJoinRequest();
      navigation.reset({ index: 0, routes: [{ name: 'JoinCreateOrganization' }] });
    } catch (e) {
      console.error('[PendingApproval] failed to cancel request:', e.code, e.message, e);
      setNotice('Something went wrong and your request wasn’t cancelled. Please try again.');
      setCancelling(false);
    }
  }

  function tryAnotherCode() {
    navigation.reset({ index: 0, routes: [{ name: 'JoinCreateOrganization' }] });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {loadError ? (
          <LoadError onRetry={() => check()} />
        ) : state === 'loading' ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : state === 'declined' ? (
          <>
            <Ionicons name="information-circle-outline" size={48} color={colors.primary} />
            <Text style={styles.heading}>Your request wasn’t approved</Text>
            <Text style={styles.body}>
              The organization’s administrator didn’t approve your request to join. If you think
              this is a mistake, ask them for their code and try again.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={tryAnotherCode}
              accessibilityRole="button"
              accessibilityLabel="Try another code"
            >
              <Text style={styles.buttonText}>Try another code</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons name="time-outline" size={48} color={colors.primary} />
            <Text style={styles.heading}>Waiting for approval</Text>
            <Text style={styles.body}>
              {orgName
                ? `Your request to join ${orgName} has been sent. Their administrator needs to approve it before you can continue.`
                : 'Your request has been sent. The organization’s administrator needs to approve it before you can continue.'}
            </Text>

            {notice ? <Text style={styles.note}>{notice}</Text> : null}

            <TouchableOpacity
              style={[styles.button, checking && styles.disabled]}
              onPress={() => check(true)}
              disabled={checking}
              accessibilityRole="button"
              accessibilityLabel="Check again"
            >
              <Text style={styles.buttonText}>{checking ? 'Checking…' : 'Check again'}</Text>
            </TouchableOpacity>

            <View style={styles.links}>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={cancelling}
                style={styles.link}
                accessibilityRole="button"
                accessibilityLabel="Cancel request"
              >
                <Text style={styles.linkText}>
                  {cancelling ? 'Cancelling…' : 'Cancel request'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Always offered, so nobody is stuck here on a shared device. */}
        <TouchableOpacity
          onPress={() => signOut(auth)}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.linkText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 64, paddingBottom: 48 },
  spinner: { marginTop: 32 },
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
    marginBottom: 24,
  },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.primary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.sansBold, color: colors.white, fontSize: 17 },
  links: { marginTop: 8 },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  linkText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.primary },
});
