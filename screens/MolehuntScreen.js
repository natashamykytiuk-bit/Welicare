import PlaceholderScreen from '../components/PlaceholderScreen';

// One of the activity options on ActivityMenuScreen.
export default function MolehuntScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Molehunt"
      description="A playful seek-and-find game designed for this resident."
      homeDestination="ModeSelection"
    />
  );
}
