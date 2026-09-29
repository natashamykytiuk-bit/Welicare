import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { createFamilyCode, listFamilyMembers, unlinkFamilyMember } from '../utils/familyLinks';

// "Family access" card on ResidentProfileScreen, shown to Caregivers and
// Administrators only. Lets staff:
//   - create a family code to give a relative, who enters it on Family Mode →
//     My Residents to be linked to this resident (view-only, plus adding
//     photos). Codes are single-use and expire after 7 days, and making a new
//     one cancels any unused old one — so a code that's passed on can't open
//     the door for more than one person;
//   - see who is linked, and remove anyone who shouldn't be.
// The code is only shown right after it's made (it's never stored anywhere
// the app can read back), so the caregiver passes it on there and then.
// Removing asks for confirmation inline rather than in an Alert, since Alert
// buttons don't work on web.
export default function FamilyAccessCard({ residentId }) {
  const [members, setMembers] = useState(null); // null while loading
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState(null); // { code, expiresAt }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmUid, setConfirmUid] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setMembers(await listFamilyMembers(residentId));
    } catch (e) {
      console.error('[FamilyAccessCard] failed to load family members:', e.code, e.message, e);
      setMembers([]);
      setLoadError('Could not load linked family members.');
    }
  }, [residentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      setCode(await createFamilyCode(residentId));
    } catch (e) {
      console.error('[FamilyAccessCard] failed to create code:', e.code, e.message, e);
      setError(e.message || 'Could not create a family code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(memberUid) {
    setBusy(true);
    setError('');
    try {
      await unlinkFamilyMember(residentId, memberUid);
      setMembers((prev) => (prev ?? []).filter((m) => m.uid !== memberUid));
      setConfirmUid(null);
    } catch (e) {
      console.error('[FamilyAccessCard] failed to remove family member:', e.code, e.message, e);
      setError(e.message || 'Could not remove this family member. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Family access</Text>
      <Text style={styles.muted}>
        Give a family member a code so they can see this resident and share photos. Each code
        works once and expires after 7 days.
      </Text>

      {code ? (
        <View style={styles.codeBox} accessible accessibilityLabel={`Family code ${code.code}`}>
          <Text style={styles.code} selectable>
            {code.code}
          </Text>
          <Text style={styles.note}>
            Expires {new Date(code.expiresAt).toLocaleDateString()}. Making a new code cancels this
            one.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleCreate}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={code ? 'Make a new family code' : 'Create family code'}
      >
        <Ionicons name="key-outline" size={20} color={colors.white} />
        <Text style={styles.primaryButtonText}>
          {code ? 'Make a new code' : 'Create family code'}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.subTitle}>Linked family</Text>
      {members === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : loadError ? (
        <Text style={styles.errorText}>{loadError}</Text>
      ) : members.length === 0 ? (
        <Text style={styles.muted}>No family members linked yet.</Text>
      ) : (
        members.map((m) => (
          <View key={m.uid} style={styles.memberRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {m.name}
            </Text>
            {confirmUid === m.uid ? (
              <>
                <TouchableOpacity
                  style={styles.dangerButton}
                  onPress={() => handleRemove(m.uid)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm remove ${m.name}`}
                >
                  <Text style={styles.dangerButtonText}>Remove</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => setConfirmUid(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.linkButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => setConfirmUid(m.uid)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.name}`}
              >
                <Text style={styles.linkButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same card look as the other sections of ResidentProfileScreen.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  subTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  muted: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 21,
  },
  note: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 4,
  },
  codeBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
  },
  code: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    letterSpacing: 2,
    color: colors.primary,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    marginTop: 12,
  },
  primaryButtonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.white },
  errorText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    marginTop: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberName: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 16, color: colors.textPrimary },
  linkButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  linkButtonText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.primary },
  dangerButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.destructive,
  },
  dangerButtonText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.white },
});
