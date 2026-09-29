import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { photoUrl } from '../utils/profilePhotos';

/** Up to two initials from a name ("Margaret Smith" → "MS"). */
export function initialsOf(name) {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Milliseconds from a Firestore Timestamp, Date or number (0 if none). */
export function millisOf(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

// A resident's round profile photo, or their initials on the clay/
// terracotta token (colors.secondary) when there's no photo or it can't be
// loaded. Used on resident cards and lists (Resident Mode, My Residents,
// Select from Organization) and the top of the resident's profile.
//
// Pass the resident doc's fields: name, photoPath, photoUpdatedAt. The
// download URL is fetched here (never stored — see utils/profilePhotos.js),
// and photoUpdatedAt goes into expo-image's cache key: replacing the photo
// overwrites the same file, so without it a stale copy could keep showing.
export default function ResidentAvatar({ name, photoPath, photoUpdatedAt, size = 56, style }) {
  const [uri, setUri] = useState(null);
  const version = millisOf(photoUpdatedAt);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    if (!photoPath) return undefined;
    photoUrl(photoPath)
      .then((url) => !cancelled && setUri(url))
      // No error UI: the initials are a perfectly good fallback.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photoPath, version]);

  const circle = { width: size, height: size, borderRadius: radii.circular };
  return (
    <View style={[styles.base, circle, style]} accessibilityElementsHidden>
      {uri ? (
        <Image
          source={{ uri, cacheKey: `${photoPath}@${version}` }}
          style={circle}
          contentFit="cover"
          cachePolicy="disk"
          onError={() => setUri(null)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.34) }]}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontFamily: fonts.sansBold, color: colors.white },
});
