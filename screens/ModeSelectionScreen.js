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
import { colors, fonts, radii } from '../theme';

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// The hub screen after login. Each entry describes one mode card (other
// than Resident Mode, which gets its own large card above these):
// whether it shows for the signed-in user's role (`isVisible`), and
// where tapping it goes (`onPress`). Every mode except Resident routes
// through PINEntry first — Resident Mode has no entry PIN, only an exit
// one (see ResidentModeScreen.js).
const MODES = [
  {
    key: 'Family',
    label: 'Family Mode',
    icon: 'heart-outline',
    description: 'View resident stats and activity history',
    isVisible: (role) => role === 'Family Caregiver',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'FamilyMode' }),
  },
  {
    key: 'Caregiver',
    label: 'Caregiver Mode',
    icon: 'people-outline',
    description: 'Resident profiles, sessions, and overall stats',
    isVisible: (role) => role === 'Caregiver' || role === 'Administrator',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'CaregiverMode' }),
  },
  {
    key: 'Volunteer',
    label: 'Volunteer Mode',
    icon: 'star-outline',
    description: 'Run activity sessions and track your hours',
    isVisible: (role) => role === 'Volunteer',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'VolunteerMode' }),
  },
  {
    key: 'Administrator',
    label: 'Admin Mode',
    icon: 'settings-outline',
    description: 'User management and organization settings',
    isVisible: (role) => role === 'Administrator',
    onPress: (navigation) => navigation.navigate('PINEntry', { destination: 'AdministratorMode' }),
  },
];

export default function ModeSelectionScreen({ navigation }) {
  // undefined while loading, then either the role string or null
  const [role, setRole] = useState(undefined);
  const [fullName, setFullName] = useState('');
  const [facilityName, setFacilityName] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      if (cancelled) return;
      setRole(data?.role ?? null);
      setFullName(data?.fullName || data?.username || '');
      if (data?.orgId) {
        const orgSnap = await getDoc(doc(db, 'organizations', data.orgId));
        if (!cancelled) setFacilityName(orgSnap.data()?.name ?? '');
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.logo}>Welicare</Text>
          <View style={styles.headerRight}>
            {role !== undefined ? (
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {fullName || 'Welcome'}
                </Text>
                <Text style={styles.userMeta} numberOfLines={1}>
                  {[role, facilityName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{fullName ? initialsOf(fullName) : ''}</Text>
            </View>
          </View>
        </View>

        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
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

        <Text style={styles.heading}>How are you using Welicare today?</Text>

        {role === undefined ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        ) : (
          <>
            <TouchableOpacity
              style={styles.residentCard}
              onPress={() => navigation.navigate('ResidentMode')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Resident Mode"
            >
              <View style={styles.residentCardText}>
                <Text style={styles.residentCardTitle}>Resident Mode</Text>
                <Text style={styles.residentCardSubtitle}>
                  Start an activity session with a resident. Music, trivia, meditation, photo
                  albums, conversation starters, and more.
                </Text>
              </View>
              <Ionicons name="person-circle-outline" size={44} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.modeGrid}>
              {MODES.filter((mode) => mode.isVisible(role)).map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={styles.card}
                  onPress={() => mode.onPress(navigation)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={mode.label}
                >
                  <View style={styles.cardTopRow}>
                    <Ionicons name={mode.icon} size={24} color={colors.primary} />
                    <View style={styles.pinBadge}>
                      <Text style={styles.pinBadgeText}>PIN</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{mode.label}</Text>
                  <Text style={styles.cardDescription}>{mode.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userInfo: { alignItems: 'flex-end', maxWidth: 160 },
  userName: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  userMeta: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.white,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  loading: { marginTop: 40 },
  residentCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: 24,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  residentCardText: { flex: 1 },
  residentCardTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.white,
    marginBottom: 8,
  },
  residentCardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.white,
    opacity: 0.9,
    lineHeight: 22,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pinBadge: {
    backgroundColor: colors.mistBackground,
    borderRadius: radii.circular,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pinBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
