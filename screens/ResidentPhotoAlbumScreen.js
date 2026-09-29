import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import PhotoViewerModal from '../components/PhotoViewerModal';
import UserAvatar from '../components/UserAvatar';
import useActivitySession from '../hooks/useActivitySession';
import { colors, fonts, radii } from '../theme';
import { getPhotoUrl, listResidentPhotos } from '../utils/residentPhotos';

// Photos further than this from the current one don't have their download
// URL fetched yet — the album can hold hundreds of photos, and a resident
// usually looks at a handful.
const NEIGHBOURS = 1;
// How far (px) a finger must travel sideways to count as a swipe.
const SWIPE_DISTANCE = 50;

// Resident Mode's Photo Album activity (the "Photo Album" tile on
// ActivityMenuScreen): a full-screen slideshow of the photos family and
// staff shared for this resident, newest first.
//
// Built for residents with dementia, often with a caregiver beside them:
//   - Very large previous/next buttons (80pt) plus swipe; the slideshow
//     wraps around at either end, so there's never a dead end.
//   - Caption in large Atkinson Hyperlegible, with "Shared by …" below.
//   - No upload, delete or edit controls here at all — those live outside
//     Resident Mode (ResidentPhotoUploadScreen / ResidentPhotoManageScreen).
//   - Loading and failures are calm: a spinner, or a soft "No photos yet"
//     style message — never technical error text. A photo whose file
//     can't be loaded is quietly skipped.
//   - Landscape-first: the photo takes the width it's given and the
//     buttons sit on either side of it, which suits an iPad on its side
//     but still works upright.
//
// Guest Mode (no resident picked) has no album, so it shows a gentle note
// instead. The tile stays on the menu for consistency with the other
// activities, which are all shown in Guest Mode too.
//
// Time spent here counts toward the resident's engagement, like every
// other activity (hooks/useActivitySession.js).
export default function ResidentPhotoAlbumScreen({ navigation, route }) {
  const residentId = route?.params?.residentId ?? null;
  useActivitySession({
    navigation,
    activityType: 'photoAlbum',
    activityId: 'photoAlbum',
    residentId,
  });

  const [photos, setPhotos] = useState([]);
  const [index, setIndex] = useState(0);
  // 'loading' | 'ready' | 'unavailable'
  const [state, setState] = useState(residentId ? 'loading' : 'ready');
  // photoId → download URL, filled in lazily around the current photo.
  const [urls, setUrls] = useState({});
  const requested = useRef(new Set());
  // Full-screen viewer (PhotoViewerModal), opened by tapping the photo.
  const [fullScreen, setFullScreen] = useState(false);

  const load = useCallback(async () => {
    if (!residentId) return;
    setState('loading');
    try {
      setPhotos(await listResidentPhotos(residentId));
      setIndex(0);
      setState('ready');
    } catch (e) {
      console.error('[ResidentPhotoAlbum] failed to load photos:', e.code, e.message, e);
      setState('unavailable');
    }
  }, [residentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Drops a photo whose file couldn't be fetched (e.g. deleted a moment
  // ago), keeping the current position sensible.
  const skipPhoto = useCallback((photoId) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      setIndex((i) => (next.length ? Math.min(i, next.length - 1) : 0));
      return next;
    });
  }, []);

  // Fetch URLs for the current photo and its neighbours only. Each photo is
  // requested once; expo-image's disk cache means going back to one is
  // instant, and prefetch warms the neighbours so "next" feels immediate.
  useEffect(() => {
    if (!photos.length) return;
    const wanted = [];
    for (let offset = -NEIGHBOURS; offset <= NEIGHBOURS; offset += 1) {
      wanted.push(photos[(index + offset + photos.length) % photos.length]);
    }
    for (const photo of wanted) {
      if (requested.current.has(photo.id)) continue;
      requested.current.add(photo.id);
      getPhotoUrl(photo.storagePath)
        .then((url) => {
          setUrls((prev) => ({ ...prev, [photo.id]: url }));
          Image.prefetch(url, 'disk').catch(() => {});
        })
        .catch((e) => {
          console.error('[ResidentPhotoAlbum] photo unavailable:', photo.id, e.code ?? e);
          skipPhoto(photo.id);
        });
    }
  }, [photos, index, skipPhoto]);

  const count = photos.length;
  const goNext = useCallback(() => count && setIndex((i) => (i + 1) % count), [count]);
  const goPrev = useCallback(() => count && setIndex((i) => (i - 1 + count) % count), [count]);

  // Horizontal swipe on the photo. Rebuilt when count changes so the
  // handlers wrap around correctly.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_DISTANCE) goNext();
          else if (g.dx >= SWIPE_DISTANCE) goPrev();
        },
      }),
    [goNext, goPrev]
  );

  const { width, height } = useWindowDimensions();
  const landscape = width >= height;
  const current = photos[index];
  const currentUrl = current ? urls[current.id] : null;

  let body;
  if (!residentId) {
    body = (
      <Message
        icon="images-outline"
        text="The photo album needs a resident to be selected."
        subtext="Choose a resident from Resident Mode to see their photos."
      />
    );
  } else if (state === 'loading') {
    body = <ActivityIndicator size="large" color={colors.activities.photoAlbum.icon} />;
  } else if (state === 'unavailable') {
    // Calm and non-technical; the retry is for the caregiver.
    body = (
      <Message
        icon="images-outline"
        text="The photos aren't ready just now."
        action={{ label: 'Try again', onPress: load }}
      />
    );
  } else if (!count) {
    body = <Message icon="images-outline" text="No photos yet" />;
  } else {
    body = (
      <View style={[styles.stage, !landscape && styles.stagePortrait]}>
        {landscape ? <NavButton direction="back" onPress={goPrev} disabled={count < 2} /> : null}
        <View style={styles.photoColumn}>
          <View style={styles.photoFrame} {...pan.panHandlers}>
            {currentUrl ? (
              // Tap the photo to open it full screen.
              <TouchableOpacity
                style={styles.photo}
                onPress={() => setFullScreen(true)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityHint="Opens the photo full screen"
              >
                <Image
                  source={{ uri: currentUrl }}
                  style={styles.photo}
                  contentFit="contain"
                  cachePolicy="disk"
                  // A soft cross-fade between photos.
                  transition={300}
                  accessible
                  accessibilityLabel={current.caption || 'Photo'}
                  onError={() => skipPhoto(current.id)}
                />
              </TouchableOpacity>
            ) : (
              <ActivityIndicator size="large" color={colors.activities.photoAlbum.icon} />
            )}
            {/* A visible way into full screen too, since tapping the photo
                isn't obvious. */}
            {currentUrl ? (
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => setFullScreen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View full screen"
              >
                <Ionicons name="expand-outline" size={32} color={colors.white} />
              </TouchableOpacity>
            ) : null}
          </View>
          {current.uploaderName ? (
            // Who shared it: a small, plain line just under the photo's
            // bottom-right — for the caregiver's benefit, so it stays out of
            // the way of the caption (the resident's main text). The avatar
            // falls back to initials if there isn't one.
            <View style={styles.sharedByRow}>
              <UserAvatar uid={current.uploadedBy} name={current.uploaderName} size={24} />
              <Text style={styles.sharedBy} numberOfLines={1}>
                Shared by {current.uploaderName}
              </Text>
            </View>
          ) : null}
          {current.caption ? (
            <Text style={styles.caption} numberOfLines={3}>
              {current.caption}
            </Text>
          ) : null}
        </View>
        {landscape ? <NavButton direction="forward" onPress={goNext} disabled={count < 2} /> : null}
        {!landscape ? (
          <View style={styles.portraitButtons}>
            <NavButton direction="back" onPress={goPrev} disabled={count < 2} />
            <NavButton direction="forward" onPress={goNext} disabled={count < 2} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.headerRow}>
        {/* Back returns to the Activity Menu; Home is PIN-gated while
            Resident Mode is locked (see HomeButton). */}
        <BackButton navigation={navigation} style={styles.iconNoMargin} />
        <HomeButton navigation={navigation} destination="ModeSelection" />
      </View>
      <View style={styles.body}>{body}</View>
      <PhotoViewerModal
        visible={fullScreen && count > 0}
        photos={photos}
        index={index}
        urls={urls}
        onIndexChange={setIndex}
        onClose={() => setFullScreen(false)}
      />
    </SafeAreaView>
  );
}

// A big round previous/next button (80pt, over the 64pt minimum).
function NavButton({ direction, onPress, disabled }) {
  const back = direction === 'back';
  return (
    <TouchableOpacity
      style={[styles.navButton, disabled && styles.navButtonHidden]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={back ? 'Previous photo' : 'Next photo'}
    >
      <Ionicons name={back ? 'chevron-back' : 'chevron-forward'} size={48} color={colors.white} />
    </TouchableOpacity>
  );
}

// Centered friendly message for the empty / guest / unavailable states.
function Message({ icon, text, subtext, action }) {
  return (
    <View style={styles.messageBox}>
      <Ionicons name={icon} size={64} color={colors.activities.photoAlbum.icon} />
      <Text style={styles.messageText}>{text}</Text>
      {subtext ? <Text style={styles.messageSubtext}>{subtext}</Text> : null}
      {action ? (
        <TouchableOpacity
          style={styles.messageButton}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.messageButtonText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.activities.photoAlbum.bg },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  iconNoMargin: { marginBottom: 0 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  stage: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16 },
  stagePortrait: { flexDirection: 'column' },
  photoColumn: { flex: 1, alignSelf: 'stretch', alignItems: 'center' },
  photoFrame: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  caption: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    lineHeight: 40,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 16,
  },
  sharedByRow: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sharedBy: {
    flexShrink: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
  },
  // 64pt, over the photo's top-right corner.
  expandButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 64,
    height: 64,
    borderRadius: radii.circular,
    backgroundColor: 'rgba(26,46,37,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    width: 80,
    height: 80,
    borderRadius: radii.circular,
    backgroundColor: colors.activities.photoAlbum.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Keeps its space (so the photo doesn't shift) when there's only one photo.
  navButtonHidden: { opacity: 0 },
  portraitButtons: { flexDirection: 'row', gap: 48, marginTop: 8 },
  messageBox: { alignItems: 'center', gap: 16, maxWidth: 520 },
  messageText: {
    fontFamily: fonts.serifBold,
    fontSize: 32,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  messageSubtext: {
    fontFamily: fonts.sansRegular,
    fontSize: 24,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 32,
  },
  messageButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 64,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: { fontFamily: fonts.sansBold, fontSize: 24, color: colors.white },
});
