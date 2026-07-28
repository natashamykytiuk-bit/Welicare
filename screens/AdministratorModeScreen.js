import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BackButton from '../components/BackButton';
import OrgIdBadge from '../components/OrgIdBadge';
import { colors, fonts, radii } from '../theme';

// Same pattern as FamilyModeScreen/CaregiverModeScreen — landed on after
// the PIN gate, back button targets ModeSelection directly.
export default function AdministratorModeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton
          navigation={navigation}
          onPress={() => navigation.navigate('ModeSelection', { animation: 'slide_from_left' })}
        />
        <OrgIdBadge />

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
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.primary,
  },
});
