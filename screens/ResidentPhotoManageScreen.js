import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import BackButton from '../components/BackButton';
import LoadError from '../components/LoadError';
import PhotoThumbGrid from '../components/PhotoThumbGrid';
import { colors, fonts, radii } from '../theme';
import { deleteResidentPhoto, listResidentPhotos } from '../utils/residentPhotos';

// "Manage photos" — every photo anyone shared for one resident, with
// delete, so Caregivers and Administrators can take down anything
// unsuitable. Reached from ResidentProfileScreen, which only shows the
// link to those two roles; firestore.rules/storage.rules only let them
// (or the uploader) delete anyway. Params: residentId, residentName.
export default function ResidentPhotoManageScreen({ navigation, route }) {
  const residentId = route?.params?.residentId;
  const residentName = route?.params?.residentName || 'this resident';
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!residentId) return;
    setFailed(false);
    try {
      setPhotos(await listResidentPhotos(residentId));
    } catch (e) {
      console.error('[ResidentPhotoManage] failed to load photos:', e.code, e.message, e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [residentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function remove(photo) {
    setMessage('');
    try {
      await deleteResidentPhoto(residentId, photo);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (e) {
      console.error('[ResidentPhotoManage] delete failed:', e.code, e.message, e);
      setMessage('That photo could not be deleted. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading}>Manage photos</Text>
        <Text style={styles.body}>
          Every photo shared for {residentName}. Delete any that shouldn't be in their album.
        </Text>
        {message ? (
          <Text style={styles.message} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : failed ? (
          <LoadError onRetry={load} />
        ) : photos.length === 0 ? (
          <Text style={styles.body}>No photos have been shared yet.</Text>
        ) : (
          <PhotoThumbGrid photos={photos} onDelete={remove} showUploader />
        )}
      </ScrollView>
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
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 20,
  },
  message: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.mistBackground,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
});
