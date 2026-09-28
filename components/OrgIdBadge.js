import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { fetchInviteCode } from '../utils/inviteCode';

// Shown at the top of every Administrator Mode screen, and on
// ModeSelectionScreen, so anyone connected to an organization can quickly
// reference/share the code new members use to join it. Self-contained (does
// its own Firestore reads) so it can be dropped into any screen without
// prop-drilling orgId down. The code lives in the org's members-only
// private/invite doc (see fetchInviteCode), so this is a two-step lookup:
// the user's orgId first, then that org's code. Renders nothing while
// loading or if the signed-in user hasn't connected to an organization.
export default function OrgIdBadge() {
  const [inviteCode, setInviteCode] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    let cancelled = false;
    async function loadInviteCode() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      // The badge is a convenience, not something a screen depends on, so
      // any failure just hides it (setInviteCode(null)) instead of showing
      // an error block. fetchInviteCode already swallows its own errors;
      // this catch covers the user-doc read.
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const orgId = userSnap.data()?.orgId;
        const code = orgId ? await fetchInviteCode(orgId) : null;
        if (!cancelled) setInviteCode(code);
      } catch (e) {
        console.error('[OrgIdBadge] failed to load invite code:', e.code, e.message, e);
        if (!cancelled) setInviteCode(null);
      }
    }
    loadInviteCode();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!inviteCode) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>ORGANIZATION INVITE CODE</Text>
      <Text style={styles.value} selectable numberOfLines={1}>
        {inviteCode}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.circular,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.6,
  },
  value: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.textPrimary,
  },
});
