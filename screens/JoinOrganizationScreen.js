import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts, radii } from '../theme';
import { formatOrgCode, joinOrganizationByCode } from '../utils/inviteCode';

// Reached from JoinCreateOrganizationScreen's "Join" card. Error message
// comes straight from joinOrganizationByCode() (e.g. "not found") since it's
// more useful to the user than a generic fallback. Resets to ModeSelection
// on success for the same reason as CreateOrganizationScreen.
export default function JoinOrganizationScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChangeCode(text) {
    setCode(formatOrgCode(text));
  }

  async function handleJoin() {
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      await joinOrganizationByCode(code);
      navigation.reset({ index: 0, routes: [{ name: 'ModeSelection' }] });
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Join an organization</Text>

        {error ? (
          <Text style={styles.errorBanner} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>Organization code</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. MG-4821"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={7}
          value={code}
          onChangeText={handleChangeCode}
          accessibilityLabel="Organization code"
        />

        <TouchableOpacity
          style={[styles.button, (!code.trim() || loading) && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={!code.trim() || loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Join organization"
        >
          <Text style={styles.buttonText}>{loading ? 'Joining…' : 'Join organization'}</Text>
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
    marginBottom: 24,
    minHeight: 56,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 18,
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
