import { Ionicons } from '@expo/vector-icons';
import { collection, deleteField, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from './BackButton';
import ChipSelector from './ChipSelector';
import { initialsOf } from './ResidentAvatar';
import { auth, db } from '../firebaseConfig';
import { colors, fonts, radii } from '../theme';
import { saveApprovedIds } from '../utils/approvedVideos';
import { thumbnailForVideoId } from '../utils/musicLibrary';
import { getCurrentUserFacilityId } from '../utils/musicLibraryQuery';
import { loadLifeStory } from '../utils/residentLifeStory';

// Stable "no server-side genre filter" value, so the library effect below
// doesn't re-run on every render for media types that filter on screen.
const NO_GENRES = [];

// Shared body of CurateResidentMusicScreen and CurateResidentMoviesScreen:
// lets a caregiver pick which library videos a given resident sees. Two
// steps: pick a resident (same createdBy/assignedCaregivers query
// ResidentModeScreen uses to list "my residents"), then a filterable
// checklist of the library that writes straight to that resident's approval
// list field. Everything that differs between music and movies (which field,
// how the library loads and filters, the wording) comes from `config` — see
// the two screen files. `config` must be a module-level constant so the
// effects below don't re-run every render.
//
// "No list saved" means the resident sees the whole library; a saved list
// (even an empty one) means only those videos.
export default function CurateResidentMedia({ navigation, config }) {
  const [residents, setResidents] = useState([]);
  const [residentsLoading, setResidentsLoading] = useState(true);
  const [residentsError, setResidentsError] = useState('');

  const [subset, setSubset] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');

  const [selectedResident, setSelectedResident] = useState(null);
  // The selected resident's life story, used only for the "favourites" hint.
  // Loaded separately because it lives in its own private doc; if it can't
  // be read, the hint just doesn't show.
  const [selectedLifeStory, setSelectedLifeStory] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterArtist, setFilterArtist] = useState('');
  const [filterGenres, setFilterGenres] = useState([]);
  const [filterDecade, setFilterDecade] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // Same two-query-merged-client-side approach as ResidentModeScreen (see
  // the comment there): avoids needing a composite index for an OR across
  // createdBy/assignedCaregivers.
  useEffect(() => {
    let cancelled = false;
    async function loadResidents() {
      setResidentsLoading(true);
      setResidentsError('');
      const uid = auth.currentUser?.uid;
      try {
        const ownedSnap = await getDocs(
          query(collection(db, 'residents'), where('createdBy', '==', uid))
        );
        const assignedSnap = await getDocs(
          query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid))
        );
        if (cancelled) return;
        const merged = new Map();
        [...ownedSnap.docs, ...assignedSnap.docs].forEach((d) =>
          merged.set(d.id, { id: d.id, ...d.data() })
        );
        setResidents(Array.from(merged.values()));
      } catch (e) {
        console.error(`[${config.logTag}] failed to load residents:`, e.code, e.message, e);
        setResidentsError('Could not load your residents. Please try again.');
      } finally {
        if (!cancelled) setResidentsLoading(false);
      }
    }
    loadResidents();
    return () => {
      cancelled = true;
    };
  }, [config]);

  // Music filters by decade + genres on the server (the library is large),
  // so it reloads when those change; movies load the whole (small) library
  // once and filter on screen. Feeding the effect constant values in the
  // movie case keeps it from reloading on every filter tap.
  const serverDecade = config.serverFilters ? filterDecade : '';
  const serverGenres = config.serverFilters ? filterGenres : NO_GENRES;
  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      setLibraryLoading(true);
      setLibraryError('');
      try {
        const facilityId = await getCurrentUserFacilityId();
        if (cancelled) return;
        const results = await config.loadLibrary({
          facilityId,
          decade: serverDecade,
          genres: serverGenres,
        });
        if (!cancelled) setSubset(results);
      } catch (e) {
        console.error(`[${config.logTag}] failed to load library:`, e.code, e.message, e);
        if (!cancelled) {
          // Plain message for staff — details (and any Firebase console
          // link, e.g. for a missing index) are in the log above.
          setLibraryError(config.libraryErrorMessage(e));
          setSubset([]);
        }
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    }
    loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [config, serverDecade, serverGenres]);

  function handleSelectResident(resident) {
    setSelectedResident(resident);
    setSelectedLifeStory(null);
    loadLifeStory(resident.id, resident)
      .then(({ lifeStory }) => setSelectedLifeStory(lifeStory))
      .catch((e) =>
        console.error(`[${config.logTag}] could not load life story hint:`, e.code, e.message, e)
      );
    setSelectedIds(new Set(resident[config.idsField] ?? []));
    setFilterArtist('');
    setFilterGenres([]);
    setFilterDecade('');
    setSaveError('');
    setSaved(false);
  }

  // Removes the approved list entirely, so the resident sees the whole
  // facility library again. Distinct from saving an empty list, which means
  // "nothing approved".
  async function handleAllowWholeLibrary() {
    setSaving(true);
    setSaveError('');
    try {
      await updateDoc(doc(db, 'residents', selectedResident.id), {
        [config.idsField]: deleteField(),
      });
      setSelectedResident((prev) => {
        const { [config.idsField]: _removed, ...rest } = prev;
        return rest;
      });
      setSelectedIds(new Set());
      setSaved(true);
    } catch (e) {
      console.error(`[${config.logTag}] failed to clear selection:`, e.code, e.message, e);
      setSaveError('Could not save this change. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleChangeResident() {
    setSelectedResident(null);
    setSelectedIds(new Set());
    setSaveError('');
    setSaved(false);
  }

  function toggleVideo(videoId) {
    setSaved(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      // Only this person's ticks/unticks are applied to the list as saved
      // now, so a colleague curating at the same time isn't overwritten
      // (see utils/approvedVideos.js). The screen then shows the merged list.
      const ids = await saveApprovedIds(
        selectedResident.id,
        config.idsField,
        selectedResident[config.idsField],
        Array.from(selectedIds)
      );
      setSelectedIds(new Set(ids));
      // Now curated: the resident sees exactly these videos — none at all
      // if the list is empty.
      setSelectedResident((prev) => ({ ...prev, [config.idsField]: ids }));
      setSaved(true);
    } catch (e) {
      console.error(`[${config.logTag}] failed to save selection:`, e.code, e.message, e);
      setSaveError('Could not save this selection. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!selectedResident) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.pickerContainer}>
          <BackButton navigation={navigation} />
          <Text style={styles.heading} accessibilityRole="header">
            Curate for Resident
          </Text>
          <Text style={styles.body}>{config.pickerIntro}</Text>

          {residentsError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {residentsError}
            </Text>
          ) : null}
          {residentsLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
          ) : residents.length === 0 ? (
            <Text style={styles.note}>You don't have any residents yet.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {residents.map((resident) => (
                <TouchableOpacity
                  key={resident.id}
                  style={styles.residentRow}
                  onPress={() => handleSelectResident(resident)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={resident.name}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(resident.name)}</Text>
                  </View>
                  <Text style={styles.residentName} numberOfLines={1}>
                    {resident.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const hintLines = selectedLifeStory ? config.hintLines(selectedLifeStory) : [];
  const curated = config.isCurated(selectedResident);
  const filteredLibrary = config.filterAndSort(subset, {
    artist: filterArtist,
    genres: filterGenres,
    decade: filterDecade,
  });

  return (
    <SafeAreaView style={styles.flex}>
      {/* One FlatList for the whole screen: the resident and filters are its
          header and the Save button its footer, so only the rows near the
          screen are rendered even for a large library. */}
      <FlatList
        data={libraryLoading || libraryError ? [] : filteredLibrary}
        keyExtractor={(entry) => entry.id}
        extraData={selectedIds}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <>
            <BackButton navigation={navigation} onPress={handleChangeResident} />
            <Text style={styles.heading} accessibilityRole="header">
              {selectedResident.name}
            </Text>
            <TouchableOpacity
              onPress={handleChangeResident}
              accessibilityRole="button"
              accessibilityLabel="Change resident"
            >
              <Text style={styles.changeResidentLink}>Change resident</Text>
            </TouchableOpacity>

            {hintLines.length > 0 ? (
              <View style={styles.hintBox}>
                {hintLines.map((line) => (
                  <Text key={line} style={styles.hintText}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Artist only exists for music; its options come from whatever
                the current genre/decade filters loaded. */}
            {config.artistFilter ? (
              <>
                <Text style={styles.sectionLabel}>Artist</Text>
                <ChipSelector
                  options={config.artistFilter(subset)}
                  value={filterArtist}
                  onChange={setFilterArtist}
                  includeAll
                />
                <View style={styles.chipSpacer} />
              </>
            ) : null}
            <Text style={styles.sectionLabel}>Genre</Text>
            <ChipSelector
              options={config.genreOptions}
              value={filterGenres}
              onChange={setFilterGenres}
              multi
            />
            <View style={styles.chipSpacer} />
            <Text style={styles.sectionLabel}>Decade</Text>
            <ChipSelector
              options={config.decadeOptions}
              value={filterDecade}
              onChange={setFilterDecade}
              includeAll
            />

            {/* Tells staff which rule currently applies to this resident —
            "no list" and "empty list" behave very differently. */}
            <Text style={styles.note}>
              {curated
                ? config.curatedNote(selectedResident.name)
                : config.uncuratedNote(selectedResident.name)}
            </Text>
            {curated ? (
              <TouchableOpacity
                onPress={handleAllowWholeLibrary}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Show the whole library instead"
              >
                <Text style={styles.errorLink}>Show the whole library instead</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.sectionLabel}>
              {config.listLabel} ({selectedIds.size} selected)
            </Text>
            {libraryError ? (
              <View style={styles.errorBox}>
                <Text style={styles.error} accessibilityRole="alert">
                  {libraryError}
                </Text>
              </View>
            ) : null}
            {libraryLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.spinner} />
            ) : !libraryError && filteredLibrary.length === 0 ? (
              <Text style={styles.note}>No videos match these filters.</Text>
            ) : null}
          </>
        }
        renderItem={({ item: entry }) => {
          const checked = selectedIds.has(entry.videoId);
          return (
            <TouchableOpacity
              key={entry.id}
              style={styles.videoRow}
              onPress={() => toggleVideo(entry.videoId)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={entry.title}
            >
              <Ionicons
                name={checked ? 'checkbox' : 'square-outline'}
                size={24}
                color={checked ? colors.primary : colors.textMuted}
              />
              <Image
                source={{ uri: entry.thumbnailUrl || thumbnailForVideoId(entry.videoId) }}
                style={styles.thumbnail}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {entry.title}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {config.subtitle(entry)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <>
            {selectedIds.size === 0 && curated ? (
              <Text style={styles.error} accessibilityRole="alert">
                {config.emptyWarning(selectedResident.name)}
              </Text>
            ) : null}
            {saveError ? (
              <Text style={styles.error} accessibilityRole="alert">
                {saveError}
              </Text>
            ) : null}
            {saved ? <Text style={styles.savedNote}>Selection saved.</Text> : null}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Save selection"
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  pickerContainer: { flex: 1, padding: 28, paddingTop: 24 },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 20,
  },
  spinner: { marginTop: 24 },
  errorBox: { marginBottom: 12 },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    marginBottom: 12,
  },
  errorLink: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  note: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.secondary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
  list: { paddingBottom: 24 },
  residentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.white,
  },
  residentName: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  changeResidentLink: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.primary,
    marginBottom: 16,
  },
  hintBox: {
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 14,
    marginBottom: 20,
    gap: 4,
  },
  hintText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 12,
  },
  chipSpacer: { height: 8 },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
  },
  savedNote: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.primary,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.white,
  },
});
