import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
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

// This is the resident-selection screen: full dark-green header, a grid of
// saved residents, plus Guest Mode / Add Resident entry points. It's the
// same screen ModeSelectionScreen and AppJS route to as "ResidentMode" —
// the route name is unchanged even though the screen itself now does real
// work (it used to just simulate picking a resident via a hardcoded name).
export default function ResidentModeScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.navigate('PINEntry', { destination: 'ModeSelection' });
        return true;
      });
      return () => subscription.remove();
    }, [navigation])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function loadResidents() {
        setLoading(true);
        const uid = auth.currentUser?.uid;
        const q = query(
          collection(db, 'residents'),
          where('createdBy', '==', uid),
          orderBy('createdAt', 'asc')
        );
        const snapshot = await getDocs(q);
        if (cancelled) return;
        setResidents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
      loadResidents();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleRemove(resident) {
    Alert.alert(
      'Remove resident',
      `Are you sure you want to remove ${resident.name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteDoc(doc(db, 'residents', resident.id));
            setResidents((prev) => prev.filter((r) => r.id !== resident.id));
          },
        },
      ]
    );
  }

  function handleEdit(resident) {
    setMenuFor(null);
    navigation.navigate('BuildProfile', { residentId: resident.id, returnTo: 'ResidentMode' });
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.header}>
        <BackButton
          navigation={navigation}
          color={colors.white}
          style={styles.headerBack}
        />
        <Text style={styles.headerTitle}>Hello! Who are we visiting today?</Text>
        <Text style={styles.headerSubtitle}>Select a resident to begin their session</Text>
      </View>

      <FlatList
        data={residents}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          loading ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null
        }
        ListFooterComponent={
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ActivityMenu', { residentName: 'Guest' })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Guest Mode"
            >
              <Text style={styles.actionTitle}>Guest Mode</Text>
              <Text style={styles.actionSubtitle}>Start a session without picking a resident</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AddResident')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add Resident"
            >
              <Text style={styles.actionTitle}>Add Resident</Text>
              <Text style={styles.actionSubtitle}>Create a new resident profile</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardBody}
              onPress={() =>
                navigation.navigate('ActivityMenu', { residentId: item.id, residentName: item.name })
              }
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
              </View>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMenuFor(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Options for ${item.name}`}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMenuFor(null)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity style={styles.menuItem} onPress={() => menuFor && handleEdit(menuFor)}>
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                const resident = menuFor;
                setMenuFor(null);
                if (resident) handleRemove(resident);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Remove Resident</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerBack: { marginBottom: 20, backgroundColor: 'transparent', borderWidth: 0 },
  headerTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.white,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.white,
    opacity: 0.85,
  },
  spinner: { marginTop: 24 },
  grid: { padding: 16, paddingBottom: 40 },
  card: {
    flex: 1 / 3,
    margin: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  cardBody: { alignItems: 'center', width: '100%' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.white,
  },
  cardName: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  menuButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: { marginTop: 12, gap: 12 },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,46,37,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 8,
    width: 220,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuItemText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
});
