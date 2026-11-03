import { useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View } from 'react-native';
import BackButton from '../../components/BackButton';
import ChipSelector from '../../components/ChipSelector';
import { colors } from '../../theme';
import {
  MOVIE_DECADE_OPTIONS,
  MOVIE_GENRE_OPTIONS,
  filterMovies,
} from '../../utils/movieLibrary';
import { thumbnailForVideoId } from '../../utils/musicLibrary';
import { EntryEditorModal, FieldLabel, LabeledInput, RemoveEntryModal } from './EntryModals';
import LibraryEntryRow from './LibraryEntryRow';
import { addMovieEntry, loadMovieLibrary, updateMovieEntry } from './libraryService';
import { styles } from './libraryStyles';
import useEntryEditor from './useEntryEditor';
import useLibraryList from './useLibraryList';
import VideoFinder, { ErrorText } from './VideoFinder';

const LOG_TAG = '[MovieLibrary]';

// Caregiver-facing screen for curating the facility's movieLibrary — the
// movie counterpart of MusicLibraryScreen, as its own independent system:
// find videos (YouTube search or a pasted link), add them with genres and a
// decade (no artist), then browse/edit/remove what's there, sorted by decade
// and title. This is the ONLY place open YouTube search exists for movies —
// residents browse just this curated list (MoviesSelectionScreen), filtered
// further by CurateResidentMoviesScreen's per-resident approvals.
export default function MovieLibraryScreen({ navigation }) {
  const list = useLibraryList({
    collectionName: 'movieLibrary',
    load: loadMovieLibrary,
    logTag: LOG_TAG,
    loadErrorMessage: 'Could not load the movie library. Please try again.',
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
        genres: entry.genres ?? [],
        decade: entry.decade ?? '',
      }
    );
  }

  function handleSave() {
    const { fields } = editor.form;
    const cleaned = {
      ...fields,
      title: fields.title.trim(),
      channelTitle: fields.channelTitle.trim(),
    };
    if (!cleaned.title || cleaned.genres.length === 0 || !cleaned.decade) {
      editor.setError('Please fill in a title, at least one genre, and a decade.');
      return;
    }
    if (editor.form.mode === 'add' && !list.facilityId) {
      editor.setError('You need to join an organization before adding to the library.');
      return;
    }
    editor.submit(async (form, attempt) => {
      if (form.mode === 'add') {
        const result = await addMovieEntry(cleaned, {
          videoId: form.videoId,
          thumbnailUrl: form.thumbnailUrl,
          facilityId: list.facilityId,
          attempt,
        });
        if (!result.added) {
          editor.setError(
            `“${result.existing.title || 'This movie'}” is already in your library, so it wasn’t added again.`
          );
          await list.reload();
          return false;
        }
      } else {
        await updateMovieEntry(form.editingId, cleaned);
      }
      await list.reload();
      return true;
    });
  }

  const filteredLibrary = filterMovies(list.library, { genre: filterGenre, decade: filterDecade });
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
              Movie Library
            </Text>
            <Text style={styles.body}>
              Search YouTube or paste a link to add movies and shows. Residents only ever see what’s
              added here.
            </Text>

            <VideoFinder
              searchKind="video"
              searchPlaceholder="Search for a movie or show"
              noun="movies"
              placeholderIcon="film-outline"
              logTag={LOG_TAG}
              isInLibrary={list.isInLibrary}
              onAdd={openAdd}
            />

            <Text style={styles.sectionLabel}>Library ({list.library.length})</Text>
            <ChipSelector
              options={MOVIE_GENRE_OPTIONS}
              value={filterGenre}
              onChange={setFilterGenre}
              includeAll
            />
            <View style={styles.chipSpacer} />
            <ChipSelector
              options={MOVIE_DECADE_OPTIONS}
              value={filterDecade}
              onChange={setFilterDecade}
              includeAll
            />

            {list.loading ? (
              <ActivityIndicator color={colors.primary} style={styles.spinner} />
            ) : null}
            <ErrorText message={list.error} />
            {!list.loading && !list.error && filteredLibrary.length === 0 ? (
              <Text style={styles.note}>No movies match these filters yet.</Text>
            ) : null}
          </>
        }
        renderItem={({ item: entry }) => (
          <LibraryEntryRow
            entry={entry}
            subtitle={`${(entry.genres ?? []).join(', ')} · ${entry.decade}`}
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
              placeholder="Movie or show title"
            />
            <LabeledInput
              label="Channel"
              value={fields.channelTitle}
              onChangeText={(channelTitle) => editor.setFields({ channelTitle })}
              placeholder="YouTube channel name"
            />
            <FieldLabel>Genres</FieldLabel>
            <ChipSelector
              options={MOVIE_GENRE_OPTIONS}
              value={fields.genres}
              onChange={(genres) => editor.setFields({ genres })}
              multi
            />
            <FieldLabel spaced>Decade</FieldLabel>
            <ChipSelector
              options={MOVIE_DECADE_OPTIONS}
              value={fields.decade}
              onChange={(decade) => editor.setFields({ decade })}
            />
          </>
        ) : null}
      </EntryEditorModal>

      <RemoveEntryModal
        target={list.confirmTarget}
        libraryName="movie library"
        removing={list.removing}
        onCancel={() => list.setConfirmTarget(null)}
        onConfirm={list.confirmRemove}
      />
    </SafeAreaView>
  );
}
