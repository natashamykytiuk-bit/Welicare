import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { getPhotoUrl } from '../utils/residentPhotos';
import UserAvatar from './UserAvatar';

// A small grid of photo thumbnails, each with a delete button that asks
// for confirmation first. Used by staff/family screens only — never in
// Resident Mode, which has no delete controls at all.
//   - ResidentPhotoUploadScreen: "Your uploads" (only the user's own).
//   - ResidentPhotoManageScreen: every photo, for caregiver moderation.
//
// Props:
//   photos      — ResidentPhoto[] (utils/residentPhotos.js)
//   onDelete    — async (photo) => void; the grid shows the confirm dialog
//   showUploader — also print "by {uploaderName}" under each thumbnail
export default function PhotoThumbGrid({ photos, onDelete, showUploader = false }) {
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    const photo = confirming;
    setDeleting(true);
    try {
      await onDelete(photo);
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  }

  return (
    <View style={styles.grid}>
      {photos.map((photo) => (
        <View key={photo.id} style={styles.cell}>
          <Thumb storagePath={photo.storagePath} />
          {/* Who shared it: avatar (or initials) and, when asked for, the name. */}
          <View style={styles.metaRow}>
            <UserAvatar uid={photo.uploadedBy} name={photo.uploaderName} size={22} />
            {showUploader && photo.uploaderName ? (
              <Text style={styles.meta} numberOfLines={1}>
                {photo.uploaderName}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setConfirming(photo)}
            accessibilityRole="button"
            accessibilityLabel={`Delete photo${photo.caption ? `: ${photo.caption}` : ''}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      ))}

      {/* A Modal rather than Alert.alert, which does nothing on web. */}
      <Modal
        visible={!!confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityRole="alert">
            <Text style={styles.dialogTitle}>Delete this photo?</Text>
            <Text style={styles.dialogBody}>It will be removed from the resident's album.</Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setConfirming(null)}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmDelete}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Delete"
              >
                <Text style={styles.confirmText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// One thumbnail. The download URL is fetched when the thumbnail mounts
// (URLs are never stored — see utils/residentPhotos.js); a failure just
// leaves the grey placeholder.
function Thumb({ storagePath }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getPhotoUrl(storagePath)
      .then((url) => !cancelled && setUri(url))
      .catch((e) => console.error('[PhotoThumbGrid] could not load thumbnail:', e));
    return () => {
      cancelled = true;
    };
  }, [storagePath]);
  return (
    <View style={styles.thumb}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" cachePolicy="disk" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: 104 },
  thumb: {
    width: 104,
    height: 104,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.mistBackground,
  },
  thumbImage: { width: '100%', height: '100%' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 13, color: colors.textMuted },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: radii.circular,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26,46,37,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  dialogTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  dialogBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 20,
  },
  dialogButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  confirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.white },
});
