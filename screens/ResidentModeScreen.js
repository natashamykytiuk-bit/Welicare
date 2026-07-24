import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { BackHandler, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

// The one screen in the app with no PIN required to enter (every user can
// reach Resident Mode from ModeSelection), but leaving it does require a
// PIN — enforced two ways:
export default function ResidentModeScreen({ navigation }) {
  // 1. Intercept the Android hardware back button while this screen is
  //    focused, and redirect to the PIN gate instead of letting it pop
  //    back to ModeSelection for free. (The iOS equivalent — disabling
  //    the swipe-back gesture — is set on this screen's registration in
  //    App.js via `gestureEnabled: false`.)
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.navigate('PINEntry', { destination: 'ModeSelection' });
        return true;
      });
      return () => subscription.remove();
    }, [navigation])
  );

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View />
          {/* 2. The on-screen Home icon — the normal, expected way out. */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('PINEntry', { destination: 'ModeSelection' })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Return to Mode Selection"
          >
            <Ionicons name="home-outline" size={20} color={PRIMARY_DARK} />
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>Resident Mode</Text>
        <Text style={styles.body}>
          Choose how you'd like to start this session.
        </Text>

        {/* All three options lead to the same ActivityMenuScreen — real
            resident selection/creation isn't built yet, so this just
            simulates picking one via the residentName param. */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ActivityMenu', { residentName: 'Guest' })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Guest Mode"
        >
          <Text style={styles.cardTitle}>Guest Mode</Text>
          <Text style={styles.cardSubtitle}>Start a session without picking a resident</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ActivityMenu', { residentName: 'Resident' })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Select Existing Resident"
        >
          <Text style={styles.cardTitle}>Select Existing Resident</Text>
          <Text style={styles.cardSubtitle}>Choose from a saved resident profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AddResident')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add Resident"
        >
          <Text style={styles.cardTitle}>Add Resident</Text>
          <Text style={styles.cardSubtitle}>Create a new resident profile</Text>
        </TouchableOpacity>
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
    marginBottom: 8,
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
