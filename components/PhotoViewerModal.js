import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, fonts, radii } from '../theme';
import LoopingPager from './LoopingPager';

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
// The swiping is LoopingPager's, the same as the album itself: it follows
// your finger and is continuous — past the last photo carries on to the
// first.
//
// Props: visible, photos (ResidentPhoto[]), index, urls ({ photoId: url }),
// onIndexChange(i), onClose().
export default function PhotoViewerModal({ visible, photos, index, urls, onIndexChange, onClose }) {
  const { width, height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        <LoopingPager
          testID="photo-viewer-list"
          items={photos}
          index={index}
          onIndexChange={onIndexChange}
          width={width}
          height={height}
          renderItem={(item) => (
            <>
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
            </>
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
