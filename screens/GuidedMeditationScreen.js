import PlaceholderScreen from '../components/PlaceholderScreen';

export default function GuidedMeditationScreen({ navigation }) {
  return (
    <PlaceholderScreen
      navigation={navigation}
      title="Guided Meditation"
      description="Calming, guided meditation sessions designed for this resident."
      homeDestination="ModeSelection"
    />
  );
}
