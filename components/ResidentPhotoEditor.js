import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { colors, fonts } from '../theme';
import {
  canEditResidentPhoto,
  pickResidentPhoto,
  removeResidentPhoto,
  setResidentPhoto,
} from '../utils/profilePhotos';
import PhotoPickerCircle from './PhotoPickerCircle';
import ResidentAvatar from './ResidentAvatar';

// A resident's profile photo with Add / Change / Remove for the people
// allowed to change it (canEditResidentPhoto — the creator, or linked /
// same-facility Caregivers and Administrators), and read-only for everyone
// else. Used at the top of BuildProfileScreen and ResidentProfileScreen.
//
// Props: residentId, resident (the resident doc's data, as the screen
// already loaded it), size. Works on its own copy of photoPath /
// photoUpdatedAt so a change shows straight away without the screen
// reloading.
export default function ResidentPhotoEditor({ residentId, resident, size = 96 }) {
  const [photo, setPhoto] = useState({
    photoPath: resident?.photoPath ?? null,
    photoUpdatedAt: resident?.photoUpdatedAt ?? null,
  });
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPhoto({
      photoPath: resident?.photoPath ?? null,
      photoUpdatedAt: resident?.photoUpdatedAt ?? null,
    });
  }, [resident?.photoPath, resident?.photoUpdatedAt]);

  // The viewer's role/org decide whether they get buttons. If this fails
  // they simply see the photo read-only.
  useEffect(() => {
    let cancelled = false;
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    // Wrapped so even a synchronous throw ends up in .catch.
    Promise.resolve()
      .then(() => getDoc(doc(db, 'users', uid)))
      .then((snap) => !cancelled && setUser(snap?.data?.() ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const editable = canEditResidentPhoto(resident, auth.currentUser?.uid, user ?? undefined);

  async function pick() {
    setMessage('');
    let image;
    try {
      image = await pickResidentPhoto();
    } catch (e) {
      setMessage(e.message || "That photo couldn't be opened.");
      return;
    }
    if (!image) return;
    setBusy(true);
    try {
      await setResidentPhoto(residentId, image);
      // A local timestamp is enough for the cache key until the next load.
      setPhoto({ photoPath: `residents/${residentId}/profile.jpg`, photoUpdatedAt: Date.now() });
    } catch (e) {
      console.error('[ResidentPhotoEditor] upload failed:', e.code, e.message, e);
      setMessage("The photo didn't upload. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMessage('');
    setBusy(true);
    try {
      await removeResidentPhoto(residentId);
      setPhoto({ photoPath: null, photoUpdatedAt: null });
    } catch (e) {
      console.error('[ResidentPhotoEditor] remove failed:', e.code, e.message, e);
      setMessage("The photo couldn't be removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <PhotoPickerCircle
        avatar={
          <ResidentAvatar
            name={resident?.name}
            photoPath={photo.photoPath}
            photoUpdatedAt={photo.photoUpdatedAt}
            size={size}
          />
        }
        hasPhoto={!!photo.photoPath}
        editable={editable}
        busy={busy}
        onPick={pick}
        onRemove={remove}
        size={size}
      />
      {message ? (
        <Text style={styles.message} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  message: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
});
