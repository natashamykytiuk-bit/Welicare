import PlaceholderScreen from '../components/PlaceholderScreen';

export default function PhotoAlbumScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Photo Album"
      description="Browse cherished photos and memories with this resident."
      homeDestination="ModeSelection"
    />
  );
}
