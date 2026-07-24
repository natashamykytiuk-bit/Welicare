import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// Same pattern as FamilyModeScreen/CaregiverModeScreen — landed on after
// the PIN gate, back button targets ModeSelection directly.
export default function AdministratorModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} onPress={() => navigation.navigate('ModeSelection')} />

        <Text style={styles.heading}>Administrator Mode</Text>
        <Text style={styles.body}>
          Manage users and configure organization-wide settings.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ManageUsers')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Manage Users"
        >
          <Text style={styles.cardTitle}>Manage Users</Text>
          <Text style={styles.cardSubtitle}>Add, remove, and edit user roles</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('OrganizationalSettings')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Organizational Settings"
        >
          <Text style={styles.cardTitle}>Organizational Settings</Text>
          <Text style={styles.cardSubtitle}>Preferences, branding, and policies</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: BOLD,
    fontSize: 26,
    color: PRIMARY_DARK,
    marginBottom: 12,
  },
  body: {
    fontFamily: REGULAR,
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: BOLD,
    fontSize: 18,
    color: PRIMARY_DARK,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: REGULAR,
    fontSize: 14,
    color: PRIMARY,
  },
});
