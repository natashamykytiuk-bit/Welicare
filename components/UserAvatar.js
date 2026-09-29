import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { avatarUrlFor } from '../utils/profilePhotos';
import { initialsOf, millisOf } from './ResidentAvatar';

// A user's round profile picture, or their initials on the primary green
// when they haven't added one — or when the viewer isn't allowed to see it
// (e.g. they're in a different organization). That fallback is silent: no
// error is ever shown, since an avatar is purely decorative.
//
// Used next to "Shared by …" in the photo album, in the Your uploads /
// Manage photos grids, Manage Users, and Settings.
//
// Props: uid, name (for initials), size, and updatedAt — pass the user's
// avatarUpdatedAt when you have it (you only do for yourself, in
// Settings), so a just-changed avatar isn't served from the image cache.
export default function UserAvatar({ uid, name, size = 32, updatedAt, style }) {
  const [uri, setUri] = useState(null);
  const version = millisOf(updatedAt);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    avatarUrlFor(uid).then((url) => !cancelled && setUri(url));
    return () => {
      cancelled = true;
    };
  }, [uid, version]);

  const circle = { width: size, height: size, borderRadius: radii.circular };
  return (
    <View style={[styles.base, circle, style]} accessibilityElementsHidden>
      {uri ? (
        <Image
          source={{ uri, cacheKey: `avatar-${uid}@${version}` }}
          style={circle}
          contentFit="cover"
          cachePolicy="disk"
          onError={() => setUri(null)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(11, Math.round(size * 0.36)) }]}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontFamily: fonts.sansBold, color: colors.white },
});
