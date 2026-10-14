import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { pickResidentPhoto, removeResidentPhoto, setResidentPhoto } from '../utils/profilePhotos';
import { canEditResident } from '../utils/residentPermissions';
import { loadViewer } from '../utils/viewer';
import PhotoPickerCircle from './PhotoPickerCircle';
import ResidentAvatar from './ResidentAvatar';

// A resident's profile photo with Add / Change / Remove for the people
// allowed to edit the resident's profile (canEditResident — the facility's
// Caregivers and Administrators, or a Family Caregiver for their own
// at-home resident), and read-only for everyone else. Used at the top of
// BuildProfileScreen and ResidentProfileScreen.
//
// Props: residentId, resident (the resident doc's data, as the screen
// already loaded it), size. Works on its own copy of photoPath /
// photoUpdatedAt so a change shows straight away without the screen
// reloading. readOnly forces the read-only view (Volunteer Mode, which
// caregiver/admin accounts can also be in).
export default function ResidentPhotoEditor({ residentId, resident, size = 96, readOnly = false }) {
  const [photo, setPhoto] = useState({
    photoPath: resident?.photoPath ?? null,
    photoUpdatedAt: resident?.photoUpdatedAt ?? null,
  });
  // Who is looking, for canEditResident: { viewer, org } once loaded.
  const [access, setAccess] = useState(null);
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
    // Wrapped so even a synchronous throw ends up in .catch.
    Promise.resolve()
      .then(() => loadViewer())
      .then((loaded) => !cancelled && setAccess(loaded))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const editable = !readOnly && !!access && canEditResident(access.viewer, access.org, resident);

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
