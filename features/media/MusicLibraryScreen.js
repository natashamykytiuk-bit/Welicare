import { useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View } from 'react-native';
import BackButton from '../../components/BackButton';
import ChipSelector from '../../components/ChipSelector';
import { colors } from '../../theme';
import {
  MUSIC_DECADE_OPTIONS,
  MUSIC_GENRE_OPTIONS,
  thumbnailForVideoId,
} from '../../utils/musicLibrary';
import { genresOf } from '../../utils/musicLibraryQuery';
import { EntryEditorModal, FieldLabel, LabeledInput, RemoveEntryModal } from './EntryModals';
import LibraryEntryRow from './LibraryEntryRow';
import { addMusicEntry, loadMusicLibrary, updateMusicEntry } from './libraryService';
import { styles } from './libraryStyles';
import useEntryEditor from './useEntryEditor';
import useLibraryList from './useLibraryList';
import VideoFinder, { ErrorText } from './VideoFinder';

const LOG_TAG = '[MusicLibrary]';

// Caregiver-facing screen for curating the shared musicLibrary collection:
// find videos (YouTube search or a pasted link), add them to the library
// with an artist, genres, and decade tag, then browse/edit/remove what's
// already in there. This is where entries shown by
// MusicSelectionScreen/CurateResidentMusicScreen come from — residents
// never see this screen.
export default function MusicLibraryScreen({ navigation }) {
  const list = useLibraryList({
    collectionName: 'musicLibrary',
    load: loadMusicLibrary,
    logTag: LOG_TAG,
    loadErrorMessage: 'Could not load the music library. Please try again.',
  });
  const editor = useEntryEditor({ logTag: LOG_TAG });
  const [filterGenre, setFilterGenre] = useState('');
  const [filterDecade, setFilterDecade] = useState('');

  function openAdd(video) {
    editor.openAdd(
      {
        videoId: video.videoId,
        thumbnailUrl: video.thumbnailUrl || thumbnailForVideoId(video.videoId),
      },
      {
        title: video.title ?? '',
        channelTitle: video.channelTitle ?? '',
        // channelTitle is the raw YouTube channel name; artist starts as the
        // same value but is separately editable, since a channel like
        // "Frank Sinatra - Topic" isn't the artist name caregivers filter by.
        artist: video.channelTitle ?? '',
        genres: [],
        decade: '',
      }
    );
  }

  function openEdit(entry) {
    editor.openEdit(
      {
        id: entry.id,
        videoId: entry.videoId,
        thumbnailUrl: entry.thumbnailUrl || thumbnailForVideoId(entry.videoId),
      },
      {
        title: entry.title ?? '',
        channelTitle: entry.channelTitle ?? '',
        artist: entry.artist ?? entry.channelTitle ?? '',
        genres: genresOf(entry),
        decade: entry.decade ?? '',
      }
    );
  }

  function handleSave() {
    const { fields } = editor.form;
    const cleaned = {
      ...fields,
      title: fields.title.trim(),
      artist: fields.artist.trim(),
      channelTitle: fields.channelTitle.trim(),
    };
    if (!cleaned.title || !cleaned.artist || cleaned.genres.length === 0 || !cleaned.decade) {
      editor.setError('Please fill in a title, artist, at least one genre, and a decade.');
      return;
    }
    if (editor.form.mode === 'add' && !list.facilityId) {
      editor.setError('You need to join an organization before adding to the library.');
      return;
    }
    editor.submit(async (form, attempt) => {
      if (form.mode === 'add') {
        const result = await addMusicEntry(cleaned, {
          videoId: form.videoId,
          thumbnailUrl: form.thumbnailUrl,
          facilityId: list.facilityId,
          attempt,
        });
        if (!result.added) {
          editor.setError(
            `“${result.existing.title || 'This song'}” is already in your library, so it wasn’t added again.`
          );
          await list.reload();
          return false;
        }
      } else {
        await updateMusicEntry(form.editingId, cleaned);
      }
      await list.reload();
      return true;
    });
  }

  const filteredLibrary = list.library.filter(
    (entry) =>
      (!filterGenre || genresOf(entry).includes(filterGenre)) &&
      (!filterDecade || entry.decade === filterDecade)
  );
  const fields = editor.form?.fields;

  return (
    <SafeAreaView style={styles.flex}>
      {/* One FlatList for the whole screen (header and filters included via
          ListHeaderComponent): FlatList only renders the rows near the
          screen, so a large library stays smooth on older tablets. */}
      <FlatList
        data={filteredLibrary}
        keyExtractor={(entry) => entry.id}
        extraData={filteredLibrary}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <>
            <BackButton navigation={navigation} />
            <Text style={styles.heading} accessibilityRole="header">
              Music Library
            </Text>
            <Text style={styles.body}>
              Search YouTube or paste a link to add videos to the shared library.
            </Text>

            <VideoFinder
              searchKind="music"
              searchPlaceholder="Search for a song or artist"
              noun="music"
              placeholderIcon="musical-note"
              logTag={LOG_TAG}
              isInLibrary={list.isInLibrary}
              onAdd={openAdd}
            />

            <Text style={styles.sectionLabel}>Library ({list.library.length})</Text>
            <ChipSelector
              options={MUSIC_GENRE_OPTIONS}
              value={filterGenre}
              onChange={setFilterGenre}
              includeAll
            />
            <View style={styles.chipSpacer} />
            <ChipSelector
              options={MUSIC_DECADE_OPTIONS}
              value={filterDecade}
              onChange={setFilterDecade}
              includeAll
            />

            {list.loading ? (
              <ActivityIndicator color={colors.primary} style={styles.spinner} />
            ) : null}
            <ErrorText message={list.error} />
            {!list.loading && !list.error && filteredLibrary.length === 0 ? (
              <Text style={styles.note}>No videos match these filters yet.</Text>
            ) : null}
          </>
        }
        renderItem={({ item: entry }) => (
          <LibraryEntryRow
            entry={entry}
            subtitle={`${entry.artist || entry.channelTitle} · ${genresOf(entry).join(', ')} · ${entry.decade}`}
            onEdit={openEdit}
            onRemove={list.setConfirmTarget}
          />
        )}
      />

      <EntryEditorModal
        visible={!!editor.form}
        heading={editor.form?.mode === 'edit' ? 'Edit Entry' : 'Add to Library'}
        error={editor.error}
        saving={editor.saving}
        onCancel={editor.close}
        onSave={handleSave}
      >
        {fields ? (
          <>
            <LabeledInput
              label="Title"
              value={fields.title}
              onChangeText={(title) => editor.setFields({ title })}
              placeholder="Song title"
            />
            <LabeledInput
              label="Artist"
              value={fields.artist}
              onChangeText={(artist) => editor.setFields({ artist })}
              placeholder="Artist name"
            />
            <LabeledInput
              label="Channel"
              value={fields.channelTitle}
              onChangeText={(channelTitle) => editor.setFields({ channelTitle })}
              placeholder="YouTube channel name"
            />
            <FieldLabel>Genres</FieldLabel>
            <ChipSelector
              options={MUSIC_GENRE_OPTIONS}
              value={fields.genres}
              onChange={(genres) => editor.setFields({ genres })}
              multi
            />
            <FieldLabel spaced>Decade</FieldLabel>
            <ChipSelector
              options={MUSIC_DECADE_OPTIONS}
              value={fields.decade}
              onChange={(decade) => editor.setFields({ decade })}
            />
          </>
        ) : null}
      </EntryEditorModal>

      <RemoveEntryModal
        target={list.confirmTarget}
        libraryName="music library"
        removing={list.removing}
        onCancel={() => list.setConfirmTarget(null)}
        onConfirm={list.confirmRemove}
      />
    </SafeAreaView>
  );
}
