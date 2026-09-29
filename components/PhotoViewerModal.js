import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, fonts, radii } from '../theme';

// How long scrolling must be still before a swipe counts as finished (web).
const SETTLE_MS = 120;

// Full-screen photo viewer for Resident Mode's Photo Album: tapping the
// photo in ResidentPhotoAlbumScreen opens this. One photo per page on a
// dark background, swiped sideways to move through the album, with the
// caption across the bottom and one large close button.
//
// It stays in step with the album screen: the page shown IS the album's
// current index (onIndexChange reports swipes), so closing lands on the
// photo you were looking at, and the album's lazy URL loading (current
// photo + neighbours) keeps the pages either side ready. Pages whose URL
// isn't in yet show a spinner.
//
// Continuous: swiping past the last photo carries on to the first, and back
// from the first to the last — never a dead end, same as the album's
// arrows. Done with the usual looping trick: the page list is
//   [copy of last, ...photos, copy of first]
// and when a swipe settles on one of the copies, the list jumps (without
// animation) to the real photo it shows, which looks identical. With only
// one photo there's nothing to loop, so no copies are added.
//
// Props: visible, photos (ResidentPhoto[]), index, urls ({ photoId: url }),
// onIndexChange(i), onClose().
export default function PhotoViewerModal({ visible, photos, index, urls, onIndexChange, onClose }) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);

  const looping = photos.length > 1;
  // The pages actually rendered (see "Continuous" above). Each keeps a
  // unique key; the copies are marked so they aren't confused with the
  // real pages.
  const pages = useMemo(() => {
    if (!looping) return photos.map((p) => ({ key: p.id, photo: p }));
    const last = photos[photos.length - 1];
    return [
      { key: `copy-start-${last.id}`, photo: last },
      ...photos.map((p) => ({ key: p.id, photo: p })),
      { key: `copy-end-${photos[0].id}`, photo: photos[0] },
    ];
  }, [photos, looping]);
  // Photo index → page, and page → photo index (the copies map onto the
  // real photo they show).
  const pageOf = (i) => (looping ? i + 1 : i);
  const photoOf = (page) => (looping ? (page - 1 + photos.length) % photos.length : page);

  // Keep the visible page in step with the album's index — when opened,
  // after a jump off a copy, or after the screen rotates.
  useEffect(() => {
    if (!visible || !photos.length) return;
    listRef.current?.scrollToIndex?.({ index: pageOf(index), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index, width, photos.length]);

  // A swipe settled at horizontal offset `x`: report the photo it landed
  // on, and if that was one of the copies, hop to the real page so the
  // loop can keep going.
  function settle(x) {
    const page = Math.round(x / width);
    if (page < 0 || page >= pages.length) return;
    const photoIndex = photoOf(page);
    if (page !== pageOf(photoIndex)) {
      listRef.current?.scrollToIndex?.({ index: pageOf(photoIndex), animated: false });
    }
    if (photoIndex !== index) onIndexChange(photoIndex);
  }

  // Working out when a swipe has finished. Phones fire
  // onMomentumScrollEnd, but the web build never does — which is what
  // stopped the loop working there. So every scroll event also restarts a
  // short timer, and once scrolling has been still for SETTLE_MS on (or
  // very near) a page boundary, that counts as settled. Settling twice is
  // harmless: the second time finds nothing to do.
  const settleTimer = useRef(null);
  function onScroll(e) {
    const x = e.nativeEvent.contentOffset.x;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      // Mid-snap on web the offset isn't on a page yet; wait for the next event.
      if (Math.abs(x / width - Math.round(x / width)) < 0.02) settle(x);
    }, SETTLE_MS);
  }
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          testID="photo-viewer-list"
          // Re-created on rotation so every page is exactly one screen wide.
          key={`viewer-${width}`}
          data={pages}
          keyExtractor={(page) => page.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(pageOf(index), Math.max(pages.length - 1, 0))}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item: { photo: item } }) => (
            <View style={{ width, height }}>
              {urls[item.id] ? (
                <Image
                  source={{ uri: urls[item.id] }}
                  style={styles.photo}
                  contentFit="contain"
                  cachePolicy="disk"
                  accessible
                  accessibilityLabel={item.caption || 'Photo'}
                />
              ) : (
                <ActivityIndicator size="large" color={colors.white} style={styles.photo} />
              )}
              {item.caption ? (
                // Bottom band, darker than the photo, so white text always reads.
                <View style={styles.captionBand}>
                  <Text style={styles.caption} numberOfLines={4}>
                    {item.caption}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        />

        <SafeAreaView style={styles.closeArea} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Close full screen"
          >
            <Ionicons name="close" size={40} color={colors.white} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.textPrimary },
  photo: { flex: 1, width: '100%' },
  captionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 36,
    backgroundColor: 'rgba(26,46,37,0.75)',
  },
  caption: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    lineHeight: 40,
    color: colors.white,
    textAlign: 'center',
  },
  closeArea: { position: 'absolute', top: 0, right: 0 },
  // 72pt — well over the 64pt minimum for resident-facing controls.
  closeButton: {
    margin: 16,
    width: 72,
    height: 72,
    borderRadius: radii.circular,
    backgroundColor: 'rgba(26,46,37,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
