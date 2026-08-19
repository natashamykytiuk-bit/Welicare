import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hasAnyLifeStoryData } from '../utils/lifeStory';

const EMPTY_LIFE_STORY = {
  preferredName: '',
  age: null,
  grewUpIn: '',
  otherPlacesLived: '',
  relationshipStatus: null,
  hasChildren: null,
  childrenDetails: '',
  hasGrandchildren: null,
  grandchildrenDetails: '',
  importantPeople: '',
  career: '',
  careerLove: '',
  hobbies: [],
  hobbiesOtherDetail: '',
  creativeHobbies: [],
  creativeHobbiesOtherDetail: '',
  musicGenres: [],
  musicGenresOtherDetail: '',
  favouriteMusicians: '',
  favouriteMovies: '',
  favouriteFoods: '',
  happiestMemory: '',
  specialPlace: '',
};

const AGE_RANGE_OPTIONS = ['Under 60', '60-70', '70-80', '80-90', '90-100', '100+'];
const RELATIONSHIP_OPTIONS = ['Married', 'Widowed', 'Divorced', 'Single', 'Prefer not to say'];
const YES_NO = ['Yes', 'No'];
const HOBBY_OPTIONS = [
  'Reading', 'Gardening', 'Cooking', 'Walking', 'Travel', 'Dancing',
  'Cards & Games', 'Church/Faith', 'Volunteering', 'Sports', 'Fishing', 'Knitting', 'Other',
];
const CREATIVE_HOBBY_OPTIONS = [
  'Painting', 'Drawing', 'Knitting', 'Sewing', 'Woodworking', 'Photography',
  'Writing', 'Playing Music', 'Singing', 'None', 'Other',
];
// Exported so MusicLibraryScreen/CurateResidentMusicScreen can reuse the
// same genre vocabulary when curating musicLibrary — keeps filter chips
// there consistent with what a resident's lifeStory.musicGenres can hold.
export const MUSIC_GENRE_OPTIONS = [
  'Classic Rock', 'Country', 'Jazz', 'Classical', 'Folk', 'Big Band',
  'Oldies/50s-60s', 'Gospel', 'Pop', 'Blues', 'Opera', 'Other',
];

function SectionHeader({ children }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function TextField({ label, value, onChangeText, placeholder, multiline, numeric }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={numeric ? 'numeric' : 'default'}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function ChipRow({ options, value, onChange, multi }) {
  function isSelected(opt) {
    return multi ? value.includes(opt) : value === opt;
  }
  function handlePress(opt) {
    if (multi) {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    } else {
      onChange(value === opt ? null : opt);
    }
  }
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => handlePress(opt)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={opt}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Resident-facing form (built with caregiver help if needed) that records a
// life-story profile, used to personalize the AI-generated activity ideas,
// conversation starters, and music/movie recs. Nothing here is required —
// residents answer as much or as little as they like.
export default function BuildProfileScreen({ navigation, route }) {
  const { residentId, returnTo = 'ActivityMenu' } = route.params ?? {};
  const [story, setStory] = useState(EMPTY_LIFE_STORY);
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const snapshot = await getDoc(doc(db, 'residents', residentId));
      if (cancelled) return;
      const lifeStory = snapshot.data()?.lifeStory;
      if (hasAnyLifeStoryData(lifeStory)) {
        setStory({ ...EMPTY_LIFE_STORY, ...lifeStory });
        setIsEdit(true);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [residentId]);

  function set(key, value) {
    setStory((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const toSave = {};
    for (const [key, value] of Object.entries(story)) {
      if (Array.isArray(value)) {
        toSave[key] = value.length > 0 ? value : [];
      } else {
        toSave[key] = value === '' ? null : value;
      }
    }
    await setDoc(doc(db, 'residents', residentId), { lifeStory: toSave }, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      navigation.navigate(returnTo, { residentId });
    }, 900);
  }

  if (loading) return <SafeAreaView style={styles.flex} />;

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>
        <Text style={styles.heading}>Tell us about yourself</Text>
        <Text style={styles.subtitle}>
          Answer as many or as few as you like — you can always come back and add more.
        </Text>

        {saved ? (
          <View style={styles.savedBanner}>
            <Text style={styles.savedBannerText}>Profile saved!</Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionHeader>About You</SectionHeader>
          <TextField
            label="Preferred name or nickname"
            value={story.preferredName}
            onChangeText={(v) => set('preferredName', v)}
            placeholder="What do you like to be called?"
          />
          <Text style={styles.fieldLabel}>Age range</Text>
          <ChipRow options={AGE_RANGE_OPTIONS} value={story.age} onChange={(v) => set('age', v)} />
          <TextField
            label="Where did you grow up?"
            value={story.grewUpIn}
            onChangeText={(v) => set('grewUpIn', v)}
            placeholder="City, town, or region"
          />
          <TextField
            label="Where else have you lived throughout your life?"
            value={story.otherPlacesLived}
            onChangeText={(v) => set('otherPlacesLived', v)}
            placeholder="Other places you've called home"
          />

          <SectionHeader>Family</SectionHeader>
          <Text style={styles.fieldLabel}>Relationship status</Text>
          <ChipRow
            options={RELATIONSHIP_OPTIONS}
            value={story.relationshipStatus}
            onChange={(v) => set('relationshipStatus', v)}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Do you have children?</Text>
          <ChipRow
            options={YES_NO}
            value={story.hasChildren === null ? null : story.hasChildren ? 'Yes' : 'No'}
            onChange={(v) => set('hasChildren', v === null ? null : v === 'Yes')}
          />
          {story.hasChildren ? (
            <TextField
              value={story.childrenDetails}
              onChangeText={(v) => set('childrenDetails', v)}
              placeholder="Any names or details you'd like to share?"
            />
          ) : null}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Do you have grandchildren?</Text>
          <ChipRow
            options={YES_NO}
            value={story.hasGrandchildren === null ? null : story.hasGrandchildren ? 'Yes' : 'No'}
            onChange={(v) => set('hasGrandchildren', v === null ? null : v === 'Yes')}
          />
          {story.hasGrandchildren ? (
            <TextField
              value={story.grandchildrenDetails}
              onChangeText={(v) => set('grandchildrenDetails', v)}
              placeholder="Tell us about them"
            />
          ) : null}

          <TextField
            label="Who are the most important people in your life?"
            value={story.importantPeople}
            onChangeText={(v) => set('importantPeople', v)}
            placeholder="Family, friends, pets..."
          />

          <SectionHeader>Work &amp; Career</SectionHeader>
          <TextField
            label="What did you do for work?"
            value={story.career}
            onChangeText={(v) => set('career', v)}
            placeholder="Your career or occupation"
          />
          <TextField
            label="What did you love most about your job?"
            value={story.careerLove}
            onChangeText={(v) => set('careerLove', v)}
            placeholder="Favourite part of your work life"
          />

          <SectionHeader>Hobbies &amp; Interests</SectionHeader>
          <Text style={styles.fieldLabel}>What did you love to do in your spare time?</Text>
          <ChipRow options={HOBBY_OPTIONS} value={story.hobbies} onChange={(v) => set('hobbies', v)} multi />
          {story.hobbies.includes('Other') ? (
            <TextField
              value={story.hobbiesOtherDetail}
              onChangeText={(v) => set('hobbiesOtherDetail', v)}
              placeholder="Tell us more"
            />
          ) : null}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Creative hobbies</Text>
          <ChipRow
            options={CREATIVE_HOBBY_OPTIONS}
            value={story.creativeHobbies}
            onChange={(v) => set('creativeHobbies', v)}
            multi
          />
          {story.creativeHobbies.includes('Other') ? (
            <TextField
              value={story.creativeHobbiesOtherDetail}
              onChangeText={(v) => set('creativeHobbiesOtherDetail', v)}
              placeholder="Tell us more"
            />
          ) : null}

          <SectionHeader>Music &amp; Entertainment</SectionHeader>
          <Text style={styles.fieldLabel}>Favourite music genres</Text>
          <ChipRow
            options={MUSIC_GENRE_OPTIONS}
            value={story.musicGenres}
            onChange={(v) => set('musicGenres', v)}
            multi
          />
          {story.musicGenres.includes('Other') ? (
            <TextField
              value={story.musicGenresOtherDetail}
              onChangeText={(v) => set('musicGenresOtherDetail', v)}
              placeholder="Other genres"
            />
          ) : null}
          <TextField
            label="Favourite musicians, bands, or singers"
            value={story.favouriteMusicians}
            onChangeText={(v) => set('favouriteMusicians', v)}
            placeholder="e.g. Frank Sinatra, The Beatles, Patsy Cline"
          />
          <TextField
            label="Favourite movies or TV shows"
            value={story.favouriteMovies}
            onChangeText={(v) => set('favouriteMovies', v)}
            placeholder="Movies or shows you've loved"
          />

          <SectionHeader>Food</SectionHeader>
          <TextField
            label="Favourite foods or meals"
            value={story.favouriteFoods}
            onChangeText={(v) => set('favouriteFoods', v)}
            placeholder="Home cooking, favourite restaurants, special dishes..."
          />

          <SectionHeader>Memories &amp; Places</SectionHeader>
          <TextField
            label="One of your happiest memories"
            value={story.happiestMemory}
            onChangeText={(v) => set('happiestMemory', v)}
            placeholder="A moment that makes you smile..."
            multiline
          />
          <TextField
            label="A place that is very special to you"
            value={story.specialPlace}
            onChangeText={(v) => set('specialPlace', v)}
            placeholder="Somewhere you love or have loved"
          />
        </ScrollView>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Save Changes' : 'Save Profile'}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Profile'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  headerRow: { paddingHorizontal: 24, paddingTop: 20 },
  iconNoMargin: { marginBottom: 0 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
    marginHorizontal: 24,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 24,
  },
  savedBanner: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  savedBannerText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
  },
  content: { padding: 24, paddingBottom: 120 },
  sectionHeader: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: 28,
    marginBottom: 12,
  },
  field: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 8 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  inputMultiline: { minHeight: 100 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  chipTextSelected: {
    fontFamily: fonts.sansBold,
    color: colors.white,
  },
  saveButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontFamily: fonts.serifBold,
    fontSize: 18,
    color: colors.white,
  },
});
