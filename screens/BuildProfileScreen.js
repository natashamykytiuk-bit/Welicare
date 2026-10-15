import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
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
import LifeStoryPeopleEditor from '../components/LifeStoryPeopleEditor';
import LoadError from '../components/LoadError';
import ResidentPhotoEditor from '../components/ResidentPhotoEditor';
import { db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { hasAnyLifeStoryData } from '../utils/lifeStory';
import { PEOPLE_LIST_KEYS, cleanPeople, withLegacyPeople } from '../utils/lifeStoryPeople';
import { MUSIC_GENRE_OPTIONS } from '../utils/musicLibrary';
import { loadLifeStory, saveResidentProfile } from '../utils/residentLifeStory';
import { canEditResident } from '../utils/residentPermissions';
import { loadViewer } from '../utils/viewer';

const EMPTY_LIFE_STORY = {
  preferredName: '',
  age: null,
  grewUpIn: '',
  otherPlacesLived: '',
  relationshipStatus: null,
  hasChildren: null,
  childrenList: [],
  hasGrandchildren: null,
  grandchildrenList: [],
  importantPeopleList: [],
  // Free-text answers from before the people lists above. No longer asked:
  // on load they're moved into the lists (withLegacyPeople) and saved back
  // as null. Still listed here so that save clears them — the saved story
  // only ever holds the keys of this object.
  childrenDetails: '',
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
  'Reading',
  'Gardening',
  'Cooking',
  'Walking',
  'Travel',
  'Dancing',
  'Cards & Games',
  'Church/Faith',
  'Volunteering',
  'Sports',
  'Fishing',
  'Knitting',
  'Other',
];
const CREATIVE_HOBBY_OPTIONS = [
  'Painting',
  'Drawing',
  'Knitting',
  'Sewing',
  'Woodworking',
  'Photography',
  'Writing',
  'Playing Music',
  'Singing',
  'None',
  'Other',
];
// The questionnaire's own fields — the only keys ever saved
// (firestore.rules' validLifeStory refuses any other).
const LIFE_STORY_FIELDS = Object.keys(EMPTY_LIFE_STORY);

// The form's answers in the shape they're saved in: only the questionnaire's
// fields (a story saved by an older app version could carry others), blank
// text stored as null, and people lists without their blank entries.
function toSavedShape(story) {
  const saved = {};
  for (const key of LIFE_STORY_FIELDS) {
    const value = story[key];
    if (PEOPLE_LIST_KEYS.includes(key)) {
      saved[key] = cleanPeople(value);
    } else {
      saved[key] = Array.isArray(value)
        ? value
        : value === '' || value === undefined
          ? null
          : value;
    }
  }
  return saved;
}

function SectionHeader({ children }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

// Longest answer firestore.rules accept for a life-story text field
// (validLifeStory). Names and nicknames are capped at NAME_MAX_LENGTH.
const ANSWER_MAX_LENGTH = 2000;
const NAME_MAX_LENGTH = 200;

// A labelled text box with a character counter. maxLength matches the
// server-side limit so the keyboard simply stops at it, rather than the
// save failing afterwards. The counter only appears once something is
// typed, to keep the (resident-facing) form uncluttered, and turns red at
// the limit so it's clear why typing stopped.
function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  numeric,
  maxLength = ANSWER_MAX_LENGTH,
}) {
  const length = value?.length ?? 0;
  const atLimit = length >= maxLength;
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
        maxLength={maxLength}
      />
      {length > 0 ? (
        <Text
          style={[styles.counter, atLimit && styles.counterAtLimit]}
          accessibilityLabel={`${length} of ${maxLength} characters used`}
        >
          {length} / {maxLength}
        </Text>
      ) : null}
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
//
// Only people who may edit this resident's profile get the form
// (utils/residentPermissions.js: the facility's Caregivers and
// Administrators, or a Family Caregiver for their own at-home resident).
// Anyone else who lands here — e.g. a volunteer following the "Complete
// Profile" prompt in Resident Mode — sees a short note instead of a form
// whose Save would be refused by firestore.rules.
export default function BuildProfileScreen({ navigation, route }) {
  const { residentId, returnTo = 'ActivityMenu' } = route.params ?? {};
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  // Name as loaded from Firestore, for the heading (see below).
  const [savedName, setSavedName] = useState('');
  // The resident doc as loaded — for the profile photo at the top.
  const [residentDoc, setResidentDoc] = useState(null);
  const [story, setStory] = useState(EMPTY_LIFE_STORY);
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Load failure → LoadError with Try again (reloadKey re-runs the effect),
  // rather than a blank screen. Save failure → a message by the Save button,
  // with the form left as-is so nothing typed is lost.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [lifeStoryDenied, setLifeStoryDenied] = useState(false);
  // True once we know this person may not edit this resident's profile.
  const [viewOnly, setViewOnly] = useState(false);
  // The name and answers as loaded (see load below).
  const originalRef = useRef({ name: '', lifeStory: toSavedShape(EMPTY_LIFE_STORY) });

  useEffect(() => {
    // Guards setState after the await if the user backs out first.
    let cancelled = false;
    async function load() {
      setLoadError(false);
      setLoading(true);
      let snapshot;
      let lifeStory;
      let denied;
      try {
        snapshot = await getDoc(doc(db, 'residents', residentId));
        // Checked before the life story is fetched: someone who can't edit
        // has no use for the form, and may not be allowed to read the story.
        const { viewer, org } = await loadViewer();
        if (!canEditResident(viewer, org, snapshot.data())) {
          if (!cancelled) {
            setViewOnly(true);
            setLoading(false);
          }
          return;
        }
        // The life story is a separate, more restricted doc (see
        // utils/residentLifeStory.js).
        ({ lifeStory, denied } = await loadLifeStory(residentId, snapshot.data()));
      } catch (e) {
        console.error('[BuildProfile] failed to load resident:', e.code, e.message, e);
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      // The resident's name lives on the doc itself (set at creation in
      // AddResidentScreen), separate from lifeStory.preferredName — that's
      // just an optional nickname the resident answers as part of the
      // questionnaire, not the identifying name shown everywhere else
      // (ResidentModeScreen's card, ActivityMenuScreen's greeting, etc.).
      setName(snapshot.data()?.name ?? '');
      setSavedName(snapshot.data()?.name ?? '');
      setResidentDoc(snapshot.data() ?? null);
      // What the form started from, so saving can tell which answers this
      // person actually changed.
      originalRef.current = {
        name: snapshot.data()?.name ?? '',
        lifeStory: toSavedShape({ ...EMPTY_LIFE_STORY, ...lifeStory }),
      };
      // Not allowed to see this life story (e.g. a volunteer whose
      // organization hasn't allowed it) — show a note instead of an empty
      // form that would look like the story doesn't exist.
      if (denied) {
        setLifeStoryDenied(true);
        setLoading(false);
        return;
      }
      if (hasAnyLifeStoryData(lifeStory)) {
        // Older free-text family answers become entries in the people lists.
        // originalRef above keeps the story as it was saved, so the
        // conversion counts as a change and is written on the next save.
        setStory(withLegacyPeople({ ...EMPTY_LIFE_STORY, ...lifeStory }));
        setIsEdit(true);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [residentId, reloadKey]);

  function set(key, value) {
    setStory((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Please enter a name.');
      return;
    }
    setNameError('');
    setSaving(true);
    setSaveError('');
    try {
      // Name and life story saved together; only what changed since the
      // form loaded is written, so a colleague's simultaneous edits to
      // other questions survive (see saveResidentProfile).
      await saveResidentProfile(residentId, {
        name: trimmedName,
        lifeStory: toSavedShape(story),
        original: originalRef.current,
        fields: LIFE_STORY_FIELDS,
      });
    } catch (e) {
      console.error('[BuildProfile] failed to save profile:', e.code, e.message, e);
      setSaveError(
        "We couldn't save this just now. Your answers are still here — please try again."
      );
      return;
    } finally {
      // Always re-enable the button, even when the save failed.
      setSaving(false);
    }
    setSaved(true);
    setTimeout(() => {
      navigation.navigate(returnTo, { residentId });
    }, 900);
  }

  if (loading) return <SafeAreaView style={styles.flex} />;

  if (viewOnly) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>
        <View style={styles.loadErrorWrap}>
          <Text style={styles.viewOnlyText}>
            This profile is kept up to date by the resident’s caregivers and administrators. If
            something should change, please let one of them know.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (lifeStoryDenied) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>
        <View style={styles.loadErrorWrap}>
          <LoadError
            message="Life stories are only visible to the care team. Please ask a caregiver or administrator if you need this information."
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>
        <View style={styles.loadErrorWrap}>
          <LoadError onRetry={() => setReloadKey((k) => k + 1)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} style={styles.iconNoMargin} />
        </View>
        {/* From Caregiver Mode (My Residents, or a resident's profile page)
            a caregiver is filling this in on someone's
            behalf, so "yourself" would read wrong — name the resident
            instead. Uses the saved name, not the field being edited, so
            the heading doesn't change with every keystroke. */}
        <Text style={styles.heading}>
          {returnTo === 'CaregiverResidents' || returnTo === 'ResidentProfile'
            ? `About ${savedName || 'this resident'}`
            : 'Tell us about yourself'}
        </Text>
        <Text style={styles.subtitle}>
          Answer as many or as few as you like — you can always come back and add more.
        </Text>

        {saved ? (
          <View style={styles.savedBanner}>
            <Text style={styles.savedBannerText}>Profile saved!</Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Profile photo — changeable by the creator and linked/facility
              Caregivers & Administrators, read-only for everyone else.
              Saved straight away, separately from the Save button below. */}
          {residentDoc ? (
            <ResidentPhotoEditor residentId={residentId} resident={residentDoc} />
          ) : null}
          <SectionHeader>About You</SectionHeader>
          <TextField
            label="Resident's name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError('');
            }}
            placeholder="Full name"
            maxLength={NAME_MAX_LENGTH}
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
          <TextField
            label="Preferred name or nickname"
            value={story.preferredName}
            onChangeText={(v) => set('preferredName', v)}
            placeholder="What do you like to be called?"
            maxLength={NAME_MAX_LENGTH}
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
            <LifeStoryPeopleEditor
              people={story.childrenList}
              onChange={(v) => set('childrenList', v)}
              noun="child"
              notesPlaceholder="Any details you'd like to share?"
            />
          ) : null}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            Do you have grandchildren?
          </Text>
          <ChipRow
            options={YES_NO}
            value={story.hasGrandchildren === null ? null : story.hasGrandchildren ? 'Yes' : 'No'}
            onChange={(v) => set('hasGrandchildren', v === null ? null : v === 'Yes')}
          />
          {story.hasGrandchildren ? (
            <LifeStoryPeopleEditor
              people={story.grandchildrenList}
              onChange={(v) => set('grandchildrenList', v)}
              noun="grandchild"
              notesPlaceholder="Tell us about them"
            />
          ) : null}

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            Who are the most important people in your life?
          </Text>
          <LifeStoryPeopleEditor
            people={story.importantPeopleList}
            onChange={(v) => set('importantPeopleList', v)}
            noun="person"
            notesPlaceholder="Family, friends, pets... who are they to you?"
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
          <ChipRow
            options={HOBBY_OPTIONS}
            value={story.hobbies}
            onChange={(v) => set('hobbies', v)}
            multi
          />
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

        {/* Right above the button, so it's seen at the moment of saving
            (the form itself may be scrolled far down). */}
        {saveError ? (
          <Text style={styles.saveError} accessibilityRole="alert">
            {saveError}
          </Text>
        ) : null}

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
  saveError: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  loadErrorWrap: { paddingHorizontal: 24 },
  viewOnlyText: {
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 26,
    marginTop: 24,
  },
  fieldError: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.destructive,
    marginTop: -12,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 8 },
  counter: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  counterAtLimit: { color: colors.destructive },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
