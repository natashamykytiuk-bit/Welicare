import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BackButton from '../components/BackButton';
import PhotoThumbGrid from '../components/PhotoThumbGrid';
import { colors, fonts, radii } from '../theme';
import {
  MAX_CAPTION,
  MAX_PHOTOS_PER_PICK,
  deleteResidentPhoto,
  listMyUploads,
  loadUploaderName,
  pickAndPreparePhotos,
  uploadResidentPhoto,
} from '../utils/residentPhotos';

// "Add Photos" for one resident — reached from Family Mode's My Residents
// and from a resident's profile in Caregiver Mode. Params: residentId,
// residentName.
//
// Pick up to 10 photos, add an optional caption to each, upload. Below,
// "Your uploads" lists ONLY the photos this person shared (so they can
// take one back) — never other people's photos and never the full album,
// which is only shown to the resident in Resident Mode
// (ResidentPhotoAlbumScreen). Caregivers moderate everyone's photos from
// ResidentPhotoManageScreen instead.
//
// Firestore/Storage rules decide who may upload (not volunteers); this
// screen is simply never linked for them.
export default function ResidentPhotoUploadScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const residentName = route?.params?.residentName || 'this resident';

  // Photos picked but not uploaded yet. status: 'ready' | 'uploading' |
  // 'done' | 'error' — shown per photo while uploading.
  const [pending, setPending] = useState([]);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [myUploads, setMyUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploadsError, setUploadsError] = useState('');

  const loadMyUploads = useCallback(async () => {
    if (!residentId) return;
    setUploadsError('');
    try {
      setMyUploads(await listMyUploads(residentId));
    } catch (e) {
      console.error('[ResidentPhotoUpload] failed to load uploads:', e.code, e.message, e);
      setUploadsError('Could not load your uploads. Please try again later.');
    } finally {
      setUploadsLoading(false);
    }
  }, [residentId]);

  useFocusEffect(
    useCallback(() => {
      loadMyUploads();
    }, [loadMyUploads])
  );

  async function pick() {
    setMessage('');
    setPicking(true);
    try {
      const photos = await pickAndPreparePhotos();
      // Keep earlier picks that haven't gone up yet, still capped at 10 per
      // upload so one batch stays quick.
      setPending((prev) =>
        [
          ...prev,
          ...photos.map((photo, i) => ({
            key: `${Date.now()}-${i}`,
            photo,
            caption: '',
            status: 'ready',
            error: '',
          })),
        ].slice(0, MAX_PHOTOS_PER_PICK)
      );
    } catch (e) {
      console.error('[ResidentPhotoUpload] pick failed:', e);
      setMessage(e.message || 'Those photos could not be opened. Please try again.');
    } finally {
      setPicking(false);
    }
  }

  function updatePending(key, changes) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }

  // One at a time, so a slow connection shows steady progress and one
  // failure doesn't stop the rest. Uploaded photos leave the list; failed
  // ones stay with their message so they can be retried.
  async function upload() {
    setMessage('');
    setUploading(true);
    let uploaderName = '';
    try {
      uploaderName = await loadUploaderName();
    } catch (e) {
      console.error('[ResidentPhotoUpload] could not load your name:', e);
    }
    let failures = 0;
    for (const item of pending) {
      if (item.status === 'done') continue;
      updatePending(item.key, { status: 'uploading', error: '' });
      try {
        await uploadResidentPhoto({
          residentId,
          photo: item.photo,
          caption: item.caption,
          uploaderName,
        });
        updatePending(item.key, { status: 'done' });
      } catch (e) {
        failures += 1;
        console.error('[ResidentPhotoUpload] upload failed:', e.code, e.message, e);
        updatePending(item.key, {
          status: 'error',
          error:
            e.code === 'storage/unauthorized' || e.code === 'permission-denied'
              ? "You don't have permission to share photos for this resident."
              : "This photo didn't upload. Please check your connection and try again.",
        });
      }
    }
    setPending((prev) => prev.filter((p) => p.status !== 'done'));
    setUploading(false);
    setMessage(
      failures
        ? `${failures} photo${failures === 1 ? '' : 's'} didn't upload. Tap Upload to try again.`
        : 'Photos shared. Thank you!'
    );
    loadMyUploads();
  }

  async function remove(photo) {
    try {
      await deleteResidentPhoto(residentId, photo);
      setMyUploads((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (e) {
      console.error('[ResidentPhotoUpload] delete failed:', e.code, e.message, e);
      setMessage('That photo could not be deleted. Please try again.');
    }
  }

  const done = pending.filter((p) => p.status === 'done').length;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Add Photos</Text>
        <Text style={styles.body}>
          Share photos for {residentName}'s photo album. They'll see them in Resident Mode.
        </Text>

        <TouchableOpacity
          style={[styles.secondaryButton, (picking || uploading) && styles.disabled]}
          onPress={pick}
          disabled={picking || uploading || pending.length >= MAX_PHOTOS_PER_PICK}
          accessibilityRole="button"
          accessibilityLabel="Choose photos"
        >
          <Ionicons name="images-outline" size={20} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>
            {picking ? 'Preparing photos…' : 'Choose photos'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Up to {MAX_PHOTOS_PER_PICK} at a time.</Text>

        {pending.map((item) => (
          <View key={item.key} style={styles.pendingRow}>
            <Image source={{ uri: item.photo.uri }} style={styles.preview} contentFit="cover" />
            <View style={styles.pendingBody}>
              <TextInput
                style={styles.captionInput}
                value={item.caption}
                onChangeText={(caption) => updatePending(item.key, { caption })}
                placeholder="Who's in this photo, and what's happening?"
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_CAPTION}
                multiline
                editable={!uploading}
                accessibilityLabel="Caption"
              />
              <View style={styles.pendingFooter}>
                <StatusLabel status={item.status} error={item.error} />
                {!uploading ? (
                  <TouchableOpacity
                    onPress={() => setPending((prev) => prev.filter((p) => p.key !== item.key))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove from this upload"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.link}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ))}

        {pending.length > 0 ? (
          <>
            <Text style={styles.permissionNote}>
              Only share photos you have permission to share.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, uploading && styles.disabled]}
              onPress={upload}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Upload photos"
            >
              {uploading ? <ActivityIndicator color={colors.white} /> : null}
              <Text style={styles.primaryButtonText}>
                {uploading
                  ? `Uploading ${Math.min(done + 1, pending.length)} of ${pending.length}…`
                  : `Upload ${pending.length} photo${pending.length === 1 ? '' : 's'}`}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {message ? (
          <Text style={styles.message} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Your uploads</Text>
        {uploadsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : uploadsError ? (
          <Text style={styles.muted}>{uploadsError}</Text>
        ) : myUploads.length === 0 ? (
          <Text style={styles.muted}>You haven't shared any photos for {residentName} yet.</Text>
        ) : (
          <PhotoThumbGrid photos={myUploads} onDelete={remove} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Per-photo progress line under each caption.
function StatusLabel({ status, error }) {
  if (status === 'uploading') return <Text style={styles.status}>Uploading…</Text>;
  if (status === 'done') return <Text style={styles.status}>Uploaded</Text>;
  if (status === 'error') return <Text style={styles.statusError}>{error}</Text>;
  return <View />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48, maxWidth: 720 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 20,
  },
  hint: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  preview: {
    width: 88,
    height: 88,
    borderRadius: radii.sm,
    backgroundColor: colors.mistBackground,
  },
  pendingBody: { flex: 1 },
  captionInput: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  pendingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  status: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.primary },
  statusError: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.destructive },
  link: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.primary },
  permissionNote: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.white },
  secondaryButton: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 48,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.primary },
  disabled: { opacity: 0.6 },
  message: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginTop: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: 32,
    marginBottom: 12,
  },
  muted: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.textMuted },
});
