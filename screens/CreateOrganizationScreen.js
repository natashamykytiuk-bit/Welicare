import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';
import { createOrganization } from '../utils/inviteCode';

const ORG_TYPES = [
  'Long-term care home',
  'Assisted living',
  'Memory care unit',
  'Adult day program',
  'Home care agency',
  'Other',
];

const PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
  'Other',
];

// Reached from JoinCreateOrganizationScreen's "Create" card. On success,
// createOrganization() writes the org doc and merges orgId onto the user's
// own record, so we reset (not push) straight to ModeSelection — there's
// nothing useful to go "back" to in this sub-flow.
export default function CreateOrganizationScreen({ navigation }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = name && type && province && city;

  async function handleCreate() {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await createOrganization({ name, type, province, city });
      navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
    } catch (e) {
      // Firestore errors carry a `.code` (e.g. "permission-denied") that the
      // generic user-facing message below deliberately hides — log it so
      // the real cause shows up in the console instead of just "something
      // went wrong".
      console.error('Org creation error:', e.code, e.message, e);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Create an organization</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Organization name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Maple Grove Care Home"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          accessibilityLabel="Organization name"
        />

        <Text style={styles.label}>Organization type</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={type} onValueChange={setType} style={styles.picker} accessibilityLabel="Organization type">
            <Picker.Item label="Select type…" value="" color={colors.textMuted} />
            {ORG_TYPES.map((t) => (
              <Picker.Item key={t} label={t} value={t} color={colors.textPrimary} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Province/Territory</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={province} onValueChange={setProvince} style={styles.picker} accessibilityLabel="Province or territory">
            <Picker.Item label="Select province/territory…" value="" color={colors.textMuted} />
            {PROVINCES.map((p) => (
              <Picker.Item key={p} label={p} value={p} color={colors.textPrimary} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          placeholder="City"
          placeholderTextColor={colors.textMuted}
          value={city}
          onChangeText={setCity}
          accessibilityLabel="City"
        />

        <TouchableOpacity
          style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit || loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create organization"
        >
          <Text style={styles.buttonText}>{loading ? 'Creating…' : 'Create organization →'}</Text>
        </TouchableOpacity>
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
    marginBottom: 24,
  },
  errorBanner: {
    fontFamily: fonts.sansRegular,
    backgroundColor: '#F6E1DC',
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
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 20,
    minHeight: 56,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: { color: colors.textPrimary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: fonts.sansBold,
    color: colors.white,
    fontSize: 17,
  },
});
