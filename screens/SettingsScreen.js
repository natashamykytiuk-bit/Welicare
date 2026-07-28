import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import appConfig from '../app.json';
import BackButton from '../components/BackButton';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';

const APP_VERSION = appConfig?.expo?.version ?? '1.0.0';

// The target of every settings-gear icon across the app (ModeSelection,
// the *ResidentsScreen/OverallStats/ManageUsers/OrganizationalSettings
// screens). One shared destination rather than a separate settings
// screen per mode.
export default function SettingsScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      if (cancelled) return;
      setFullName(data?.fullName || data?.username || '');
      setRole(data?.role ?? '');
      if (data?.orgId) {
        const orgSnap = await getDoc(doc(db, 'organizations', data.orgId));
        if (!cancelled) setOrgName(orgSnap.data()?.name ?? '');
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
        <BackButton navigation={navigation} />

        <Text style={styles.heading}>Settings</Text>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <InfoRow label="Full name" value={fullName || '—'} />
          <InfoRow label="Email" value={auth.currentUser?.email || '—'} />
          <InfoRow label="Role" value={role || '—'} />
          <InfoRow label="Organization" value={orgName || '—'} last />
        </View>

        <View style={styles.card}>
          <Row
            label="Change PIN"
            onPress={() => navigation.navigate('ForgotPin', { destination: 'Settings' })}
            showArrow
          />
          <Row
            label="Change Password"
            onPress={() =>
              navigation.navigate('ForgotPassword', { email: auth.currentUser?.email })
            }
            showArrow
          />
          <Row
            label="Change Username"
            onPress={() => navigation.navigate('ChangeUsername')}
            showArrow
            last
          />
        </View>

        <View style={styles.card}>
          <Row label="Sign Out" destructive onPress={() => signOut(auth)} last />
        </View>

        {role === 'Administrator' ? (
          <>
            <Text style={styles.sectionLabel}>Organization</Text>
            <View style={styles.card}>
              <Row label="Manage Users" onPress={() => navigation.navigate('ManageUsers')} />
              <Row
                label="Organizational Settings"
                onPress={() => navigation.navigate('OrganizationalSettings')}
                last
              />
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <InfoRow label="Version" value={APP_VERSION} last />
        </View>

        <Text style={styles.footer}>Welicare</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Row({ label, onPress, destructive, last, showArrow }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      {showArrow ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  rowLabelDestructive: {
    color: colors.destructive,
  },
  rowValue: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    marginLeft: 16,
    flexShrink: 1,
    textAlign: 'right',
  },
  footer: {
    fontFamily: fonts.serifBold,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
