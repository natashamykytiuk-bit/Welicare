import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Shown at the top of every Administrator Mode screen, and on
// ModeSelectionScreen, so anyone connected to an organization can quickly
// reference/share the code new members use to join it. Self-contained (does
// its own Firestore reads) so it can be dropped into any screen without
// prop-drilling orgId down. The code lives on the organization doc (not the
// user doc), so this is a two-step lookup — same shape as
// ModeSelectionScreen's own facility-name fetch. Renders nothing while
// loading or if the signed-in user hasn't connected to an organization.
export default function OrgIdBadge() {
  const [inviteCode, setInviteCode] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    let cancelled = false;
    async function loadInviteCode() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const orgId = userSnap.data()?.orgId;
      if (!orgId) {
        if (!cancelled) setInviteCode(null);
        return;
      }
      const orgSnap = await getDoc(doc(db, 'organizations', orgId));
      if (!cancelled) setInviteCode(orgSnap.data()?.inviteCode ?? null);
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
