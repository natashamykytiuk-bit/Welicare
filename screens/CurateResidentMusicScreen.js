import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import ChipSelector from '../components/ChipSelector';
import { auth, db } from '../firebaseConfig';
import { MUSIC_GENRE_OPTIONS } from './BuildProfileScreen';
import { colors, fonts, radii } from '../theme';
import { MUSIC_DECADE_OPTIONS, thumbnailForVideoId } from '../utils/musicLibrary';
import { distinctArtists, extractConsoleLink, queryMusicLibrarySubset } from '../utils/musicLibraryQuery';

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// Lets a caregiver pick which musicLibrary videos a given resident sees on
// MusicSelectionScreen. Two steps: pick a resident (same
// createdBy/assignedCaregivers query ResidentModeScreen uses to list "my
// residents"), then a filterable checklist of the library — same
// artist/genre/decade filter bar as MusicSelectionScreen, backed by the
// same queryMusicLibrarySubset helper — that writes straight to that
// resident's selectedMusicVideoIds field.
export default function CurateResidentMusicScreen({ navigation }) {
  const [residents, setResidents] = useState([]);
  const [residentsLoading, setResidentsLoading] = useState(true);
  const [residentsError, setResidentsError] = useState('');

  const [subset, setSubset] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');

  const [selectedResident, setSelectedResident] = useState(null);
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
        const ownedSnap = await getDocs(query(collection(db, 'residents'), where('createdBy', '==', uid)));
        const assignedSnap = await getDocs(
          query(collection(db, 'residents'), where('assignedCaregivers', 'array-contains', uid))
        );
        if (cancelled) return;
        const merged = new Map();
        [...ownedSnap.docs, ...assignedSnap.docs].forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
        setResidents(Array.from(merged.values()));
      } catch (e) {
        console.error('[CurateResidentMusic] failed to load residents:', e.code, e.message, e);
        setResidentsError('Could not load your residents. Please try again.');
      } finally {
        if (!cancelled) setResidentsLoading(false);
      }
    }
    loadResidents();
    return () => {
      cancelled = true;
    };
  }, []);

  // Decade + genres are applied server-side; artist is applied client-side
  // on top (see queryMusicLibrarySubset's comment for why).
  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      setLibraryLoading(true);
      setLibraryError('');
      try {
        const results = await queryMusicLibrarySubset({ decade: filterDecade, genres: filterGenres });
        if (!cancelled) setSubset(results);
      } catch (e) {
        console.error('[CurateResidentMusic] failed to load library:', e.code, e.message, e);
        if (!cancelled) {
          setLibraryError(
            e.code === 'failed-precondition' ? e.message : 'Could not load the music library. Please try again.'
          );
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
  }, [filterDecade, filterGenres]);

  function handleSelectResident(resident) {
    setSelectedResident(resident);
    setSelectedIds(new Set(resident.selectedMusicVideoIds ?? []));
    setFilterArtist('');
    setFilterGenres([]);
    setFilterDecade('');
    setSaveError('');
    setSaved(false);
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
      await updateDoc(doc(db, 'residents', selectedResident.id), {
        selectedMusicVideoIds: Array.from(selectedIds),
      });
      setSaved(true);
    } catch (e) {
      console.error('[CurateResidentMusic] failed to save selection:', e.code, e.message, e);
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
          <Text style={styles.heading}>Curate for Resident</Text>
          <Text style={styles.body}>Choose a resident to curate their music &amp; video selection.</Text>

          {residentsError ? <Text style={styles.error}>{residentsError}</Text> : null}
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

  const lifeStory = selectedResident.lifeStory;
  const hasHint = lifeStory && (lifeStory.favouriteMusicians || (lifeStory.musicGenres ?? []).length > 0);
  const availableArtists = distinctArtists(subset);
  const filteredLibrary = (filterArtist ? subset.filter((v) => (v.artist || v.channelTitle) === filterArtist) : subset)
    .slice()
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  const consoleLink = extractConsoleLink(libraryError);

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} onPress={handleChangeResident} />
        <Text style={styles.heading}>{selectedResident.name}</Text>
        <TouchableOpacity onPress={handleChangeResident} accessibilityRole="button" accessibilityLabel="Change resident">
          <Text style={styles.changeResidentLink}>Change resident</Text>
        </TouchableOpacity>

        {hasHint ? (
          <View style={styles.hintBox}>
            {lifeStory.favouriteMusicians ? (
              <Text style={styles.hintText}>Favourite musicians: {lifeStory.favouriteMusicians}</Text>
            ) : null}
            {(lifeStory.musicGenres ?? []).length > 0 ? (
              <Text style={styles.hintText}>Enjoys: {lifeStory.musicGenres.join(', ')}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Artist</Text>
        <ChipSelector options={availableArtists} value={filterArtist} onChange={setFilterArtist} includeAll />
        <View style={styles.chipSpacer} />
        <Text style={styles.sectionLabel}>Genre</Text>
        <ChipSelector options={MUSIC_GENRE_OPTIONS} value={filterGenres} onChange={setFilterGenres} multi />
        <View style={styles.chipSpacer} />
        <Text style={styles.sectionLabel}>Decade</Text>
        <ChipSelector options={MUSIC_DECADE_OPTIONS} value={filterDecade} onChange={setFilterDecade} includeAll />

        <Text style={styles.sectionLabel}>
          Videos ({selectedIds.size} selected)
        </Text>
        {libraryError ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{libraryError}</Text>
            {consoleLink ? (
              <TouchableOpacity onPress={() => Linking.openURL(consoleLink)} accessibilityRole="link">
                <Text style={styles.errorLink}>{consoleLink}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {libraryLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : !libraryError && filteredLibrary.length === 0 ? (
          <Text style={styles.note}>No videos match these filters.</Text>
        ) : (
          filteredLibrary.map((entry) => {
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
                    {entry.artist || entry.channelTitle} · {(entry.genres ?? []).join(', ')} · {entry.decade}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        {saved ? <Text style={styles.savedNote}>Selection saved.</Text> : null}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Save selection"
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
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
