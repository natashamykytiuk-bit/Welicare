import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const PRIMARY_LIGHT = '#BAE6FD';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

const MODES = [
  {
    key: 'Resident',
    label: 'Resident Mode',
    icon: 'person-outline',
    isVisible: () => true,
    onPress: (navigation) => navigation.navigate('ResidentMode'),
  },
  {
    key: 'Family',
    label: 'Family Mode',
    icon: 'people-outline',
    isVisible: (role) => role === 'Family Caregiver',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'FamilyMode' }),
  },
  {
    key: 'Caregiver',
    label: 'Caregiver Mode',
    icon: 'medkit-outline',
    isVisible: (role) => role === 'Caregiver' || role === 'Administrator',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'CaregiverMode' }),
  },
  {
    key: 'Volunteer',
    label: 'Volunteer Mode',
    icon: 'heart-outline',
    isVisible: (role) => role === 'Volunteer',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'VolunteerMode' }),
  },
  {
    key: 'Administrator',
    label: 'Administrator Mode',
    icon: 'settings-outline',
    isVisible: (role) => role === 'Administrator',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'AdministratorMode' }),
  },
];

export default function ModeSelectionScreen({ navigation }) {
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      if (!cancelled) setRole(snap.data()?.role ?? null);
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={PRIMARY_DARK} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => signOut(auth)}
            style={styles.signOutButton}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>Welicare</Text>
        <Text style={styles.subheading}>Choose a mode to get started</Text>

        {role === undefined ? (
          <ActivityIndicator size="large" color={PRIMARY} style={styles.loading} />
        ) : (
          MODES.filter((mode) => mode.isVisible(role)).map((mode) => (
            <TouchableOpacity
              key={mode.key}
              style={styles.card}
              onPress={() => mode.onPress(navigation)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={mode.label}
            >
              <Ionicons name={mode.icon} size={26} color={PRIMARY} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>{mode.label}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PRIMARY_LIGHT,
    minHeight: 40,
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: REGULAR,
    fontSize: 14,
    color: TEXT_MUTED,
  },
  heading: {
    fontFamily: BOLD,
    fontSize: 30,
    color: PRIMARY_DARK,
    marginBottom: 6,
  },
  subheading: {
    fontFamily: REGULAR,
    fontSize: 16,
    color: TEXT_MUTED,
    marginBottom: 28,
  },
  loading: {
    marginTop: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardIcon: {
    flexShrink: 0,
  },
  cardTitle: {
    fontFamily: BOLD,
    fontSize: 18,
    color: PRIMARY_DARK,
  },
});
