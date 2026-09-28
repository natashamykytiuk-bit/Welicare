import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import {
  TOPICS_TO_AVOID_MAX_LENGTH,
  loadTopicsToAvoid,
  saveTopicsToAvoid,
} from '../utils/residentSafety';

// Staff-only "Safety notes" for one resident, reached from the shield
// button on each row of CaregiverResidentsScreen ("My Residents"). One
// free-text list of topics to avoid — things that upset the resident or
// aren't safe for them. Everyone who runs sessions with the resident can
// read it; only Caregivers and Administrators can change it (enforced by
// firestore.rules — others see it read-only here). The AI suggestion screens
// pass it to generateSuggestions, which is told never to suggest these.
//
// Deliberately NOT part of BuildProfileScreen: that form is filled in with
// the resident, and they shouldn't read a list of what upsets them.
export default function ResidentSafetyScreen({ navigation, route }) {
  const { residentId } = route.params ?? {};
  const [residentName, setResidentName] = useState('');
  const [text, setText] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Guards setState after the awaits if the user backs out first.
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const [residentSnap, userSnap, notes] = await Promise.all([
          getDoc(doc(db, 'residents', residentId)),
          getDoc(doc(db, 'users', auth.currentUser?.uid ?? '-')),
          loadTopicsToAvoid(residentId),
        ]);
        if (cancelled) return;
        setResidentName(residentSnap.data()?.name ?? 'this resident');
        setText(notes);
        // Mirrors the rules: only these roles may write safety notes.
        setCanEdit(['Caregiver', 'Administrator'].includes(userSnap.data()?.role));
      } catch (e) {
        console.error('[ResidentSafety] failed to load:', e.code, e.message);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [residentId, reloadKey]);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      await saveTopicsToAvoid(residentId, text);
      setSaved(true);
    } catch (e) {
      console.error('[ResidentSafety] failed to save:', e.code, e.message);
      // Nothing typed is lost — the text stays in the box for another try.
      setSaveError('Could not save these notes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const atLimit = text.length >= TOPICS_TO_AVOID_MAX_LENGTH;

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackButton navigation={navigation} />
          <Text style={styles.heading}>Safety notes</Text>

          {loadError ? (
            <LoadError onRetry={() => setReloadKey((k) => k + 1)} />
          ) : loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
          ) : (
            <>
              <Text style={styles.body}>
                Topics to avoid with {residentName}: people, events, activities or foods that upset
                them or aren&apos;t safe. Staff and volunteers see these notes, and AI suggestions
                are told never to include them. {residentName} doesn&apos;t see them.
              </Text>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setSaved(false);
                }}
                editable={canEdit}
                multiline
                textAlignVertical="top"
                maxLength={TOPICS_TO_AVOID_MAX_LENGTH}
                placeholder={
                  canEdit
                    ? 'e.g. Don’t mention her late husband. No water activities. No peanuts.'
                    : 'No safety notes yet.'
                }
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Topics to avoid"
              />
              {text.length > 0 ? (
                <Text style={[styles.counter, atLimit && styles.counterAtLimit]}>
                  {text.length} / {TOPICS_TO_AVOID_MAX_LENGTH}
                </Text>
              ) : null}

              {canEdit ? (
                <>
                  {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
                  {saved ? <Text style={styles.savedNote}>Saved.</Text> : null}
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Save safety notes"
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.readOnlyNote}>
                  Only caregivers and administrators can change these notes.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 16,
  },
  spinner: { marginTop: 24 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textPrimary,
    padding: 16,
    minHeight: 180,
  },
  counter: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  counterAtLimit: { color: colors.destructive },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    marginTop: 12,
  },
  savedNote: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.primary,
    marginTop: 12,
  },
  readOnlyNote: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.white,
  },
});
