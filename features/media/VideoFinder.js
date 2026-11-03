import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme';
import { extractYouTubeVideoId, thumbnailForVideoId } from '../../utils/musicLibrary';
import { searchYouTube } from '../../utils/youtube';
import { styles } from './libraryStyles';

// The "Search YouTube" and "Paste a YouTube link" sections of a staff
// library screen. Each found video shows an Add button, or an "In library"
// badge when isInLibrary says it's already there.
//
// searchKind is passed to the searchYouTube callable ('music' or 'video');
// noun ('music' / 'movies') fills the generic search error.
export default function VideoFinder({
  searchKind,
  searchPlaceholder,
  noun,
  placeholderIcon,
  logTag,
  isInLibrary,
  onAdd,
}) {
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [urlText, setUrlText] = useState('');
  const [urlPreview, setUrlPreview] = useState(null);
  const [urlError, setUrlError] = useState('');

  async function handleSearch() {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError('');
    try {
      setResults(await searchYouTube(trimmed, searchKind));
    } catch (e) {
      console.error(`${logTag} searchYouTube error:`, e.code, e.message, e.details, e);
      // A usage limit (functions/rateLimit.js) explains itself; anything else
      // stays generic.
      setSearchError(
        e.code === 'functions/resource-exhausted'
          ? e.message
          : `Something went wrong searching for ${noun}. Please try again.`
      );
      setResults([]);
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

  return (
    <>
      <Text style={styles.sectionLabel}>Search YouTube</Text>
      <InputRow
        label="Search YouTube"
        value={searchText}
        onChangeText={setSearchText}
        placeholder={searchPlaceholder}
        onSubmit={handleSearch}
        returnKeyType="search"
        buttonIcon="search"
        buttonLabel="Search"
      />
      {searching ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
      <ErrorText message={searchError} />
      {results.map((video) => (
        <VideoCard
          key={video.videoId}
          thumbnailUrl={video.thumbnailUrl}
          placeholderIcon={placeholderIcon}
          title={video.title}
          subtitle={video.channelTitle}
          inLibrary={isInLibrary(video.videoId)}
          addLabel={`Add ${video.title} to library`}
          onAdd={() => onAdd(video)}
        />
      ))}

      <Text style={styles.sectionLabel}>Paste a YouTube link</Text>
      <InputRow
        label="Paste a YouTube link"
        value={urlText}
        onChangeText={setUrlText}
        placeholder="https://youtube.com/watch?v=..."
        onSubmit={handleParseUrl}
        returnKeyType="done"
        buttonIcon="link"
        buttonLabel="Find video"
        plain
      />
      <ErrorText message={urlError} />
      {urlPreview ? (
        <VideoCard
          thumbnailUrl={urlPreview.thumbnailUrl}
          subtitle={urlPreview.videoId}
          inLibrary={isInLibrary(urlPreview.videoId)}
          addLabel="Add this video to library"
          onAdd={() => onAdd({ videoId: urlPreview.videoId, title: '', channelTitle: '' })}
        />
      ) : null}
    </>
  );
}

// A text field with a square action button beside it. `plain` turns off
// autocapitalise/autocorrect, for URLs.
function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  onSubmit,
  returnKeyType,
  buttonIcon,
  buttonLabel,
  plain,
}) {
  return (
    <View style={styles.searchRow}>
      <TextInput
        accessibilityLabel={label}
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={plain ? 'none' : undefined}
        autoCorrect={plain ? false : undefined}
        onSubmitEditing={onSubmit}
        returnKeyType={returnKeyType}
      />
      <TouchableOpacity
        style={styles.searchButton}
        onPress={onSubmit}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
      >
        <Ionicons name={buttonIcon} size={20} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function VideoCard({ thumbnailUrl, placeholderIcon, title, subtitle, inLibrary, addLabel, onAdd }) {
  return (
    <View style={styles.resultCard}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={styles.artPlaceholder}>
          <Ionicons name={placeholderIcon} size={22} color={colors.primary} />
        </View>
      )}
      <View style={styles.cardText}>
        {title !== undefined ? (
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {inLibrary ? (
        <InLibraryBadge />
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          hitSlop={4}
          onPress={onAdd}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Shown in place of the Add button for a video that's already in the
// library. Not a button, but readable by screen readers so it's clear why
// Add isn't offered.
function InLibraryBadge() {
  return (
    <View style={styles.inLibraryBadge} accessible accessibilityLabel="Already in library">
      <Ionicons name="checkmark" size={16} color={colors.primary} />
      <Text style={styles.inLibraryText}>In library</Text>
    </View>
  );
}

export function ErrorText({ message }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {message}
    </Text>
  );
}
