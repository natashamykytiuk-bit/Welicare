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
import ActivityMenuScreen from './screens/ActivityMenuScreen';
import AddResidentScreen from './screens/AddResidentScreen';
import AdministratorModeScreen from './screens/AdministratorModeScreen';
import CaregiverModeScreen from './screens/CaregiverModeScreen';
import CaregiverResidentsScreen from './screens/CaregiverResidentsScreen';
import ConversationStartersScreen from './screens/ConversationStartersScreen';
import FamilyFeedScreen from './screens/FamilyFeedScreen';
import FamilyModeScreen from './screens/FamilyModeScreen';
import FamilyResidentsScreen from './screens/FamilyResidentsScreen';
import GamesScreen from './screens/GamesScreen';
import GuidedMeditationScreen from './screens/GuidedMeditationScreen';
import HourTrackerScreen from './screens/HourTrackerScreen';
import JoinCreateOrganizationScreen from './screens/JoinCreateOrganizationScreen';
import ManageUsersScreen from './screens/ManageUsersScreen';
import ModeSelectionScreen from './screens/ModeSelectionScreen';
import MolehuntScreen from './screens/MolehuntScreen';
import MusicMovieRecsScreen from './screens/MusicMovieRecsScreen';
import MusicPlayerScreen from './screens/MusicPlayerScreen';
import OrganizationalSettingsScreen from './screens/OrganizationalSettingsScreen';
import OverallStatsScreen from './screens/OverallStatsScreen';
import PhotoAlbumScreen from './screens/PhotoAlbumScreen';
import PINEntryScreen from './screens/PINEntryScreen';
import PINSetupScreen from './screens/PINSetupScreen';
import ResidentModeScreen from './screens/ResidentModeScreen';
import ResidentProfileScreen from './screens/ResidentProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import TriviaScreen from './screens/TriviaScreen';
import VolunteerModeScreen from './screens/VolunteerModeScreen';
import VolunteerResidentsScreen from './screens/VolunteerResidentsScreen';
import WelcomeScreen from './screens/WelcomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  // undefined = still resolving, null = signed out, object = signed in
  const [user, setUser] = useState(undefined);
  // True only for the moment right after a brand-new sign-up, so the very
  // first screen after auth can be PINSetup instead of ModeSelection.
  // Reset to false on sign-out so a later sign-in doesn't show it again.
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });

  // Firebase notifies us here whenever the signed-in/out state changes —
  // this is what actually flips the app between the two screen sets below.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      if (!u) setJustSignedUp(false);
    });
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
      {/*
        Only one of the two branches below is ever rendered, based on
        whether `user` is signed in. Swapping between them resets the
        navigator to `initialRouteName`, which is how a fresh sign-up
        lands on PINSetup while a normal sign-in lands on ModeSelection.
      */}
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={
          user ? (justSignedUp ? 'PINSetup' : 'ModeSelection') : 'Welcome'
        }
      >
        {user ? (
          <>
            {/* Onboarding, shown only right after sign-up */}
            <Stack.Screen name="PINSetup" component={PINSetupScreen} />
            <Stack.Screen name="JoinCreateOrganization" component={JoinCreateOrganizationScreen} />

            {/* The post-login hub, plus screens reachable from anywhere */}
            <Stack.Screen name="ModeSelection" component={ModeSelectionScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            {/* Reusable PIN check — every mode entry (and Resident Mode's
                exit) routes through here with a `destination` param. */}
            <Stack.Screen name="PINEntry" component={PINEntryScreen} />

            {/* Family Mode */}
            <Stack.Screen name="FamilyMode" component={FamilyModeScreen} />
            <Stack.Screen name="FamilyResidents" component={FamilyResidentsScreen} />

            {/* Caregiver Mode */}
            <Stack.Screen name="CaregiverMode" component={CaregiverModeScreen} />
            <Stack.Screen name="CaregiverResidents" component={CaregiverResidentsScreen} />
            <Stack.Screen name="OverallStats" component={OverallStatsScreen} />

            {/* Administrator Mode */}
            <Stack.Screen name="AdministratorMode" component={AdministratorModeScreen} />
            <Stack.Screen name="ManageUsers" component={ManageUsersScreen} />
            <Stack.Screen name="OrganizationalSettings" component={OrganizationalSettingsScreen} />

            {/* Volunteer Mode */}
            <Stack.Screen name="VolunteerMode" component={VolunteerModeScreen} />
            <Stack.Screen name="HourTracker" component={HourTrackerScreen} />
            <Stack.Screen name="VolunteerResidents" component={VolunteerResidentsScreen} />

            {/* Resident Mode. gestureEnabled: false blocks the iOS
                swipe-back gesture here, so the only way out is the
                Home icon, which goes through the PIN gate. */}
            <Stack.Screen
              name="ResidentMode"
              component={ResidentModeScreen}
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen name="ActivityMenu" component={ActivityMenuScreen} />
            <Stack.Screen name="GuidedMeditation" component={GuidedMeditationScreen} />
            <Stack.Screen name="MusicPlayer" component={MusicPlayerScreen} />
            <Stack.Screen name="Games" component={GamesScreen} />
            <Stack.Screen name="Trivia" component={TriviaScreen} />
            <Stack.Screen name="PhotoAlbum" component={PhotoAlbumScreen} />
            <Stack.Screen name="Molehunt" component={MolehuntScreen} />

            {/* Shared screens used across multiple modes (mainly
                Caregiver Mode's quick links, and Resident Mode's
                Add Resident / resident-info-edit shortcuts) */}
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
            {/* Rendered via a children function (instead of `component`)
                so we can pass onSignUpSuccess, which flips justSignedUp
                without SignUpScreen needing to know about App's state. */}
            <Stack.Screen name="SignUp">
              {(props) => <SignUpScreen {...props} onSignUpSuccess={() => setJustSignedUp(true)} />}
            </Stack.Screen>
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
