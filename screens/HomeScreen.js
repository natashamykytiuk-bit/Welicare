import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebaseConfig';

const BG = '#ECFEFF';
const PRIMARY = '#0891B2';
const PRIMARY_DARK = '#164E63';
const PRIMARY_LIGHT = '#BAE6FD';
const CTA = '#059669';
const CTA_LIGHT = '#D1FAE5';
const CTA_DARK = '#065F46';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6B7280';
const BORDER = '#BAE6FD';
const BOLD = 'AtkinsonHyperlegible_700Bold';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

const ACTIVITY_SUGGESTIONS = [
  'Reconnect with old hobbies and cherished interests',
  'Create a memory book with photos and personal stories',
  'Join a local community group based on past interests',
  'Start a simple daily routine with familiar activities',
  'Share life experiences through guided conversation',
];

const QUICK_LINKS = [
  { label: 'Add Resident', screen: 'AddResident' },
  { label: 'Resident Profile', screen: 'ResidentProfile' },
  { label: 'Activity Ideas', screen: 'ActivityIdeas' },
  { label: 'Conversation Starters', screen: 'ConversationStarters' },
  { label: 'Music & Movie Recs', screen: 'MusicMovieRecs' },
  { label: 'Family Feed', screen: 'FamilyFeed' },
];

export default function HomeScreen({ navigation }) {
  const [bio, setBio] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  function handleFindActivities() {
    if (!bio.trim()) return;
    setSuggestions(ACTIVITY_SUGGESTIONS);
    setSubmitted(true);
  }

  function handleReset() {
    setBio('');
    setSuggestions([]);
    setSubmitted(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Text style={styles.headerTitle}>Welicare</Text>
            <Text style={styles.headerSubtitle}>Activity Finder</Text>
          </View>
          <TouchableOpacity
            onPress={() => signOut(auth)}
            style={styles.signOutButton}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Quick links */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickLinksRow}
          contentContainerStyle={styles.quickLinksContent}
        >
          {QUICK_LINKS.map((link) => (
            <TouchableOpacity
              key={link.screen}
              style={styles.quickLinkChip}
              onPress={() => navigation.navigate(link.screen)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={link.label}
            >
              <Text style={styles.quickLinkChipText}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Intro card */}
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>About This Person</Text>
          <Text style={styles.introBody}>
            Tell us about their life, interests, and what brings them joy.
            We'll suggest meaningful activities tailored to who they are.
          </Text>
        </View>

        {/* Input area */}
        {!submitted ? (
          <>
            <TextInput
              style={styles.textArea}
              placeholder="For example: She spent 30 years as a nurse, loves gardening and classical music, and misses cooking for her family…"
              placeholderTextColor="#93C5D9"
              multiline
              textAlignVertical="top"
              value={bio}
              onChangeText={setBio}
              accessibilityLabel="Tell us about this person"
            />

            <TouchableOpacity
              style={[styles.ctaButton, !bio.trim() && styles.ctaButtonDisabled]}
              onPress={handleFindActivities}
              activeOpacity={0.85}
              disabled={!bio.trim()}
              accessibilityRole="button"
              accessibilityLabel="Find activity suggestions"
            >
              <Text style={styles.ctaButtonText}>Find Activities</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Suggestion results */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Suggested Activities</Text>
              <Pressable onPress={handleReset} accessibilityRole="button" accessibilityLabel="Start over">
                <Text style={styles.startOverText}>Start over</Text>
              </Pressable>
            </View>

            {suggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestionCard}>
                <View style={styles.suggestionIndex}>
                  <Text style={styles.suggestionIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </View>
            ))}

            <View style={styles.footerNote}>
              <Text style={styles.footerNoteText}>
                These suggestions are based on what you shared. Adjust them to fit this person's current abilities and preferences.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerBrand: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: BOLD,
    fontSize: 22,
    color: PRIMARY_DARK,
  },
  headerSubtitle: {
    fontFamily: REGULAR,
    fontSize: 13,
    color: PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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

  // Quick links
  quickLinksRow: {
    marginBottom: 20,
  },
  quickLinksContent: {
    gap: 10,
    paddingRight: 4,
  },
  quickLinkChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  quickLinkChipText: {
    fontFamily: BOLD,
    fontSize: 14,
    color: PRIMARY_DARK,
  },

  // Intro card
  introCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  introTitle: {
    fontFamily: BOLD,
    fontSize: 18,
    color: PRIMARY_DARK,
    marginBottom: 8,
  },
  introBody: {
    fontFamily: REGULAR,
    fontSize: 15,
    color: TEXT_BODY,
    lineHeight: 23,
  },

  // Text area
  textArea: {
    fontFamily: REGULAR,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 18,
    fontSize: 16,
    color: PRIMARY_DARK,
    minHeight: 180,
    lineHeight: 25,
    marginBottom: 20,
    textAlignVertical: 'top',
  },

  // CTA button
  ctaButton: {
    backgroundColor: CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginBottom: 8,
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaButtonText: {
    fontFamily: BOLD,
    color: '#fff',
    fontSize: 17,
    letterSpacing: 0.2,
  },

  // Results
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultsTitle: {
    fontFamily: BOLD,
    fontSize: 18,
    color: PRIMARY_DARK,
  },
  startOverText: {
    fontFamily: REGULAR,
    fontSize: 14,
    color: PRIMARY,
  },
  suggestionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: BORDER,
    gap: 14,
  },
  suggestionIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CTA_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  suggestionIndexText: {
    fontFamily: BOLD,
    fontSize: 14,
    color: CTA_DARK,
  },
  suggestionText: {
    fontFamily: REGULAR,
    fontSize: 15,
    color: TEXT_BODY,
    lineHeight: 23,
    flex: 1,
  },

  // Footer note
  footerNote: {
    backgroundColor: CTA_LIGHT,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  footerNoteText: {
    fontFamily: REGULAR,
    fontSize: 14,
    color: CTA_DARK,
    lineHeight: 21,
  },
});
