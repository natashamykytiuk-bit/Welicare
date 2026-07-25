import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

// Reached two ways: from Caregiver Mode's quick links, and from
// ResidentModeScreen's "Add Resident" option. Just captures a name — the
// rest of the resident's profile is filled in later via BuildProfileScreen
// (prompted by the banner on ActivityMenuScreen). Goes back to wherever it
// was opened from rather than assuming a specific destination screen.
export default function AddResidentScreen({ navigation }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await addDoc(collection(db, 'residents'), {
      name: trimmed,
      createdBy: auth.currentUser?.uid,
      createdAt: serverTimestamp(),
      lifeStory: null,
    });
    setSaving(false);
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Add a resident</Text>
        <Text style={styles.body}>Create a new resident profile.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Resident's full name"
          placeholderTextColor={colors.textMuted}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create resident"
        >
          <Text style={styles.buttonText}>{saving ? 'Creating…' : 'Create resident'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 28, paddingTop: 24 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 24,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
  },
});
