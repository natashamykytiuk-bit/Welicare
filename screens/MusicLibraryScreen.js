import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import ChipSelector from '../components/ChipSelector';
import { auth, db } from '../firebaseConfig';
import { MUSIC_GENRE_OPTIONS } from './BuildProfileScreen';
import { colors, fonts, radii } from '../theme';
import { MUSIC_DECADE_OPTIONS, extractYouTubeVideoId, thumbnailForVideoId } from '../utils/musicLibrary';
import { genresOf } from '../utils/musicLibraryQuery';
import { searchYouTube } from '../utils/youtube';

const LOAD_TIMEOUT_MS = 10000;

// Caregiver-facing screen for curating the shared musicLibrary collection:
// find videos (YouTube search or a pasted link), add them to the library
// with an artist, genres, and decade tag, then browse/edit/remove what's
// already in there. This is where entries shown by
// MusicSelectionScreen/CurateResidentMusicScreen come from — residents
// never see this screen.
export default function MusicLibraryScreen({ navigation }) {
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [urlText, setUrlText] = useState('');
  const [urlPreview, setUrlPreview] = useState(null);
  const [urlError, setUrlError] = useState('');

  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');

  const [filterGenre, setFilterGenre] = useState('');
  const [filterDecade, setFilterDecade] = useState('');

  // Shared add/edit form state — formMode picks which write handleSaveForm
  // performs, formEditingId carries the doc id being edited (unused in add
  // mode, where a new doc is created instead).
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formEditingId, setFormEditingId] = useState(null);
  const [formVideoId, setFormVideoId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formChannelTitle, setFormChannelTitle] = useState('');
  const [formArtist, setFormArtist] = useState('');
  const [formThumbnailUrl, setFormThumbnailUrl] = useState('');
  const [formGenres, setFormGenres] = useState([]);
  const [formDecade, setFormDecade] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const snapshot = await getDocs(collection(db, 'musicLibrary'));
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
      setLibrary(list);
    } catch (e) {
      console.error('[MusicLibrary] failed to load library:', e.code, e.message, e);
      setLibraryError('Could not load the music library. Please try again.');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // Reload whenever this screen regains focus (e.g. after backing out of
  // the add/edit flow), same pattern as ResidentModeScreen's resident list.
  useFocusEffect(
    useCallback(() => {
      loadLibrary();
    }, [loadLibrary])
  );

  async function handleSearch() {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError('');
    try {
      const found = await searchYouTube(trimmed, 'music');
      setSearchResults(found);
    } catch (e) {
      console.error('[MusicLibrary] searchYouTube error:', e.code, e.message, e.details, e);
      setSearchError('Something went wrong searching for music. Please try again.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleParseUrl() {
    const videoId = extractYouTubeVideoId(urlText.trim());
    if (!videoId) {
      setUrlPreview(null);
      setUrlError("Couldn't find a YouTube video in that link. Try pasting the full URL.");
      return;
    }
    setUrlError('');
    setUrlPreview({ videoId, thumbnailUrl: thumbnailForVideoId(videoId) });
  }

  function openAddModal(video) {
    setFormMode('add');
    setFormEditingId(null);
    setFormVideoId(video.videoId);
    setFormTitle(video.title ?? '');
    setFormChannelTitle(video.channelTitle ?? '');
    // channelTitle is the raw YouTube channel name; artist starts as the
    // same value (the common case) but is separately editable, since a
    // channel like "Frank Sinatra - Topic" isn't always the display-ready
    // artist name a caregiver wants to search/filter by.
    setFormArtist(video.channelTitle ?? '');
    setFormThumbnailUrl(video.thumbnailUrl || thumbnailForVideoId(video.videoId));
    setFormGenres([]);
    setFormDecade('');
    setFormError('');
    setFormVisible(true);
  }

  function openEditModal(entry) {
    setFormMode('edit');
    setFormEditingId(entry.id);
    setFormVideoId(entry.videoId);
    setFormTitle(entry.title ?? '');
    setFormChannelTitle(entry.channelTitle ?? '');
    setFormArtist(entry.artist ?? entry.channelTitle ?? '');
    setFormThumbnailUrl(entry.thumbnailUrl || thumbnailForVideoId(entry.videoId));
    setFormGenres(genresOf(entry));
    setFormDecade(entry.decade ?? '');
    setFormError('');
    setFormVisible(true);
  }

  async function handleSaveForm() {
    const title = formTitle.trim();
    const artist = formArtist.trim();
    if (!title || !artist || formGenres.length === 0 || !formDecade) {
      setFormError('Please fill in a title, artist, at least one genre, and a decade.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      if (formMode === 'add') {
        await addDoc(collection(db, 'musicLibrary'), {
          videoId: formVideoId,
          title,
          channelTitle: formChannelTitle.trim(),
          artist,
          thumbnailUrl: formThumbnailUrl || thumbnailForVideoId(formVideoId),
          genres: formGenres,
          decade: formDecade,
          addedAt: serverTimestamp(),
          addedByUid: auth.currentUser?.uid ?? null,
        });
      } else {
        await updateDoc(doc(db, 'musicLibrary', formEditingId), {
          title,
          channelTitle: formChannelTitle.trim(),
          artist,
          genres: formGenres,
          decade: formDecade,
        });
      }
      setFormVisible(false);
      await loadLibrary();
    } catch (e) {
      console.error('[MusicLibrary] failed to save entry:', e.code, e.message, e);
      setFormError('Could not save this entry. Please try again.');
    } finally {
      setFormSaving(false);
    }
  }

  function handleRemove(entry) {
    Alert.alert('Remove from library', `Remove "${entry.title}" from the music library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'musicLibrary', entry.id));
            setLibrary((prev) => prev.filter((e) => e.id !== entry.id));
          } catch (e) {
            console.error('[MusicLibrary] failed to remove entry:', e.code, e.message, e);
            Alert.alert('Could not remove this entry', 'Please try again.');
          }
        },
      },
    ]);
  }

  const filteredLibrary = library.filter(
    (entry) =>
      (!filterGenre || genresOf(entry).includes(filterGenre)) && (!filterDecade || entry.decade === filterDecade)
  );

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Music Library</Text>
        <Text style={styles.body}>Search YouTube or paste a link to add videos to the shared library.</Text>

        <Text style={styles.sectionLabel}>Search YouTube</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search for a song or artist"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        {searching ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {searchError ? <Text style={styles.error}>{searchError}</Text> : null}
        {searchResults.map((video) => (
          <View key={video.videoId} style={styles.resultCard}>
            {video.thumbnailUrl ? (
              <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
            ) : (
              <View style={styles.artPlaceholder}>
                <Ionicons name="musical-note" size={22} color={colors.primary} />
              </View>
            )}
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {video.title}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {video.channelTitle}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => openAddModal(video)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Add ${video.title} to library`}
            >
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionLabel}>Paste a YouTube link</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={urlText}
            onChangeText={setUrlText}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleParseUrl}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleParseUrl}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Find video"
          >
            <Ionicons name="link" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        {urlError ? <Text style={styles.error}>{urlError}</Text> : null}
        {urlPreview ? (
          <View style={styles.resultCard}>
            <Image source={{ uri: urlPreview.thumbnailUrl }} style={styles.thumbnail} />
            <View style={styles.cardText}>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {urlPreview.videoId}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => openAddModal({ videoId: urlPreview.videoId, title: '', channelTitle: '' })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add this video to library"
            >
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Library ({library.length})</Text>
        <ChipSelector options={MUSIC_GENRE_OPTIONS} value={filterGenre} onChange={setFilterGenre} includeAll />
        <View style={styles.chipSpacer} />
        <ChipSelector options={MUSIC_DECADE_OPTIONS} value={filterDecade} onChange={setFilterDecade} includeAll />

        {libraryLoading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {libraryError ? <Text style={styles.error}>{libraryError}</Text> : null}
        {!libraryLoading && !libraryError && filteredLibrary.length === 0 ? (
          <Text style={styles.note}>No videos match these filters yet.</Text>
        ) : null}

        {filteredLibrary.map((entry) => (
          <View key={entry.id} style={styles.resultCard}>
            <Image source={{ uri: entry.thumbnailUrl || thumbnailForVideoId(entry.videoId) }} style={styles.thumbnail} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {entry.title}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {entry.artist || entry.channelTitle} · {genresOf(entry).join(', ')} · {entry.decade}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => openEditModal(entry)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${entry.title}`}
            >
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => handleRemove(entry)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${entry.title}`}
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setFormVisible(false)} />
          <ScrollView contentContainerStyle={styles.modalSheetWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.modalSheet}>
              <Text style={styles.modalHeading}>{formMode === 'add' ? 'Add to Library' : 'Edit Entry'}</Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Song title"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Artist</Text>
              <TextInput
                style={styles.input}
                value={formArtist}
                onChangeText={setFormArtist}
                placeholder="Artist name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Channel</Text>
              <TextInput
                style={styles.input}
                value={formChannelTitle}
                onChangeText={setFormChannelTitle}
                placeholder="YouTube channel name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Genres</Text>
              <ChipSelector options={MUSIC_GENRE_OPTIONS} value={formGenres} onChange={setFormGenres} multi />

              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Decade</Text>
              <ChipSelector options={MUSIC_DECADE_OPTIONS} value={formDecade} onChange={setFormDecade} />

              {formError ? <Text style={styles.error}>{formError}</Text> : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setFormVisible(false)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveButton}
                  onPress={handleSaveForm}
                  disabled={formSaving}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Save"
                >
                  {formSaving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
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
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { marginBottom: 16 },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.destructive,
    marginBottom: 12,
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
  chipSpacer: { height: 8 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  artPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
    alignItems: 'center',
    justifyContent: 'center',
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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.circular,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,46,37,0.35)',
  },
  modalSheetWrap: { flexGrow: 1, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: 24,
    paddingBottom: 32,
  },
  modalHeading: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  fieldLabelSpaced: { marginTop: 12 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalSaveButton: {
    flex: 1,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
});
