import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth } from './firebaseConfig';
import ActivityIdeasScreen from './screens/ActivityIdeasScreen';
import AddResidentScreen from './screens/AddResidentScreen';
import ConversationStartersScreen from './screens/ConversationStartersScreen';
import FamilyFeedScreen from './screens/FamilyFeedScreen';
import HomeScreen from './screens/HomeScreen';
import MusicMovieRecsScreen from './screens/MusicMovieRecsScreen';
import ResidentProfileScreen from './screens/ResidentProfileScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import WelcomeScreen from './screens/WelcomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  // undefined = still resolving, null = signed out, object = signed in
  const [user, setUser] = useState(undefined);
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return unsubscribe;
  }, []);

  if (user === undefined || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2D9B8A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="AddResident" component={AddResidentScreen} />
            <Stack.Screen name="ResidentProfile" component={ResidentProfileScreen} />
            <Stack.Screen name="ActivityIdeas" component={ActivityIdeasScreen} />
            <Stack.Screen name="ConversationStarters" component={ConversationStartersScreen} />
            <Stack.Screen name="MusicMovieRecs" component={MusicMovieRecsScreen} />
            <Stack.Screen name="FamilyFeed" component={FamilyFeedScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="SignIn" component={SignInScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});
