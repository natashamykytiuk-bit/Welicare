import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

// A circular photo with "Add photo" / "Change photo" / "Remove photo"
// underneath — the editor for a resident's profile photo (AddResident,
// BuildProfile) and a user's own avatar (Settings). It only draws the
// controls; the screen does the picking and uploading.
//
// Props:
//   avatar      — what to show in the circle when there's no local preview
//                 (a ResidentAvatar / UserAvatar for the saved photo)
//   previewUri  — a just-picked local image, shown instead of `avatar`
//   hasPhoto    — whether there's a photo to change/remove
//   editable    — false shows the circle read-only (no buttons), for people
//                 who may see but not change the photo
//   busy        — shows a spinner and disables the buttons
//   onPick / onRemove
//   size        — circle diameter
export default function PhotoPickerCircle({
  avatar,
  previewUri,
  hasPhoto,
  editable = true,
  busy = false,
  onPick,
  onRemove,
  size = 96,
}) {
  const circle = { width: size, height: size, borderRadius: radii.circular };
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onPick}
        disabled={!editable || busy}
        activeOpacity={0.8}
        accessibilityRole={editable ? 'button' : 'image'}
        accessibilityLabel={editable ? (hasPhoto ? 'Change photo' : 'Add photo') : 'Photo'}
      >
        <View style={[styles.circle, circle]}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={circle} contentFit="cover" />
          ) : (
            avatar
          )}
          {busy ? (
            <View style={[styles.busy, circle]}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : null}
        </View>
        {/* Outside the clipped circle so the badge isn't cut off. */}
        {editable && !hasPhoto && !busy ? (
          <View style={styles.badge}>
            <Ionicons name="camera-outline" size={18} color={colors.white} />
          </View>
        ) : null}
      </TouchableOpacity>
      {editable ? (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onPick}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? 'Change photo' : 'Add photo'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.link}>{hasPhoto ? 'Change photo' : 'Add photo'}</Text>
          </TouchableOpacity>
          {hasPhoto ? (
            <TouchableOpacity
              onPress={onRemove}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.removeLink}>Remove photo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: 16 },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  busy: {
    position: 'absolute',
    backgroundColor: 'rgba(26,46,37,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: radii.circular,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 20, marginTop: 10 },
  link: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.primary },
  removeLink: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.textMuted },
});
