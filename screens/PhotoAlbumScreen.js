import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function PhotoAlbumScreen({ navigation, route }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Photo Album"
      description="Browse cherished photos and memories with this resident."
      homeDestination="ModeSelection"
      // Logs time here toward the resident's engagement, see PlaceholderScreen.
      activityType="photoAlbum"
      activityId="photoAlbum"
      residentId={route?.params?.residentId}
    />
  );
}
