import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';
import { formatOrgCode } from '../utils/inviteCode';
import { previewResidentMove, requestResidentMove } from '../utils/residentManagement';

// Family Mode → My Residents → "Move to an organization" on a resident the
// family member has been looking after at home. This is how a relative
// who's moving into a care home is handed over to it — one resident at a
// time, so someone else can stay at home and stay fully theirs. (A family
// account never joins the organization itself.)
//
// Three steps on one screen, because the family member is giving something
// up and should see exactly what before it happens:
//   1. 'code'    — enter the organization's code. The server checks it and
//                  tells us the organization's name; nothing is saved yet
//                  (previewResidentMove).
//   2. 'confirm' — "Move [name] to [organization]?" spelling out that
//                  they'll be able to view the profile but not edit it.
//                  Cancel goes back to step 1 with everything unchanged.
//   3. 'sent'    — the request is recorded (requestResidentMove) and waits
//                  for the organization's administrator to approve it. Until
//                  then the resident is still at home and still editable.
//
// The checks that matter are all on the server (requestResidentMove in
// functions/index.js); error messages come straight from it since they're
// written for the person using the app.
//
// Params: residentId, residentName.
export default function MoveResidentScreen({ navigation, route }) {
  const { residentId, residentName } = route?.params ?? {};
  const name = residentName || 'this resident';

  const [step, setStep] = useState('code');
  const [code, setCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const org = orgName || 'this organization';

  // Step 1 → 2: look the code up without saving anything.
  async function handleContinue() {
    if (code.length < 9 || busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await previewResidentMove(residentId, code);
      setOrgName(result.orgName ?? '');
      setStep('confirm');
    } catch (e) {
      console.error('[MoveResident] code check failed:', e.code, e.message, e);
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Step 2 → 3: the family member has read the warning and agreed.
  async function handleConfirm() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await requestResidentMove(residentId, code);
      setStep('sent');
    } catch (e) {
      console.error('[MoveResident] request failed:', e.code, e.message, e);
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Cancel on the confirmation: back to the code, nothing was written.
  function handleCancel() {
    setError('');
    setStep('code');
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} />

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {step === 'code' ? (
          <>
            <Text style={styles.heading} accessibilityRole="header">
              Move {name} to an organization
            </Text>
            <Text style={styles.body}>
              If {name} is moving into a care home that uses Welicare, enter the code the care home
              gave you. You’ll see what changes before anything is sent.
            </Text>
            <Text style={styles.label}>Organization code</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MGK7-4TXR"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              value={code}
              onChangeText={(t) => setCode(formatOrgCode(t))}
              accessibilityLabel="Organization code"
            />
            <TouchableOpacity
              style={[styles.button, (code.length < 9 || busy) && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={code.length < 9 || busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.buttonText}>{busy ? 'Checking…' : 'Continue'}</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'confirm' ? (
          <View style={styles.card}>
            <Text style={styles.heading} accessibilityRole="header">
              Move {name} to {org}?
            </Text>
            <Text style={styles.body}>
              {org} will manage {name}’s profile. Once they approve, you’ll be able to view {name}’s
              profile and share photos, but not edit it. Caregivers and administrators at {org} will
              handle updates.
            </Text>
            <Text style={styles.body}>
              Only {org} can change this afterwards, so please make sure it’s the right place.
            </Text>
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${org}`}
            >
              <Text style={styles.buttonText}>{busy ? 'Sending…' : `Move to ${org}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleCancel}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'sent' ? (
          <>
            <Text style={styles.heading} accessibilityRole="header">
              Request sent
            </Text>
            <Text style={styles.body}>
              {org} has been asked to take on {name}’s profile. Until their administrator approves,
              nothing changes — {name} stays in your list and you can still edit their profile. You
              can cancel the request from My Residents.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Back to My Residents"
            >
              <Text style={styles.buttonText}>Back to My Residents</Text>
            </TouchableOpacity>
          </>
        ) : null}
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
    marginTop: 8,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 17,
    color: colors.textPrimary,
    lineHeight: 25,
    marginBottom: 20,
  },
  // The confirmation sits in a calm card (surface + border), not a warning
  // colour: it's a decision to read carefully, not an error.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 8,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.mistBackground,
    borderColor: colors.destructive,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.destructive,
    fontSize: 16,
    padding: 14,
    marginBottom: 20,
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.sansBold,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.textPrimary,
    marginBottom: 24,
    minHeight: 56,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginTop: 12,
  },
  secondaryButtonText: { fontFamily: fonts.sansBold, color: colors.textPrimary, fontSize: 17 },
});
