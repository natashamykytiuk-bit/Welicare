import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth, db } from './firebaseConfig';

import ActivityIdeasScreen from './screens/ActivityIdeasScreen';
import ActivityMenuScreen from './screens/ActivityMenuScreen';
import AddResidentScreen from './screens/AddResidentScreen';
import AdministratorModeScreen from './screens/AdministratorModeScreen';
import BuildProfileScreen from './screens/BuildProfileScreen';
import CaregiverModeScreen from './screens/CaregiverModeScreen';
import CaregiverResidentsScreen from './screens/CaregiverResidentsScreen';
import ChangeUsernameScreen from './screens/ChangeUsernameScreen';
import ConversationStartersScreen from './screens/ConversationStartersScreen';
import CreateOrganizationScreen from './screens/CreateOrganizationScreen';
import EmailVerificationScreen from './screens/EmailVerificationScreen';
import FamilyFeedScreen from './screens/FamilyFeedScreen';
import FamilyModeScreen from './screens/FamilyModeScreen';
import FamilyResidentsScreen from './screens/FamilyResidentsScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ForgotPinScreen from './screens/ForgotPinScreen';
import GamesScreen from './screens/GamesScreen';
import GuidedMeditationScreen from './screens/GuidedMeditationScreen';
import HourTrackerScreen from './screens/HourTrackerScreen';
import JoinCreateOrganizationScreen from './screens/JoinCreateOrganizationScreen';
import JoinOrganizationScreen from './screens/JoinOrganizationScreen';
import ManageUsersScreen from './screens/ManageUsersScreen';
import ModeSelectionScreen from './screens/ModeSelectionScreen';
import MolehuntScreen from './screens/MolehuntScreen';
import MoviesVideosScreen from './screens/MoviesVideosScreen';
import MusicMovieRecsScreen from './screens/MusicMovieRecsScreen';
import MusicPlayerScreen from './screens/MusicPlayerScreen';
import MusicSelectionScreen from './screens/MusicSelectionScreen';
import OrganizationalSettingsScreen from './screens/OrganizationalSettingsScreen';
import OverallStatsScreen from './screens/OverallStatsScreen';
import PhotoAlbumScreen from './screens/PhotoAlbumScreen';
import PINEntryScreen from './screens/PINEntryScreen';
import PINSetupScreen from './screens/PINSetupScreen';
import ResidentModeScreen from './screens/ResidentModeScreen';
import ResidentProfileScreen from './screens/ResidentProfileScreen';
import SelectOrganizationResidentScreen from './screens/SelectOrganizationResidentScreen';
import SettingsScreen from './screens/SettingsScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import TriviaScreen from './screens/TriviaScreen';
import VolunteerModeScreen from './screens/VolunteerModeScreen';
import VolunteerResidentsScreen from './screens/VolunteerResidentsScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import WordGamesScreen from './screens/WordGamesScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  // undefined = still resolving, null = signed out, object = signed in
  const [user, setUser] = useState(undefined);
  // undefined while this user's onboarding doc is loading, then an object
  // of { needsPin, needsOrg } computed from what's actually saved in
  // Firestore — this is what initialRouteName below reads, instead of a
  // one-shot "just signed up" flag, so the routing decision survives app
  // restarts and sign-out/sign-in cycles.
  const [onboardingStatus, setOnboardingStatus] = useState(undefined);
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    Lora_400Regular,
    Lora_700Bold,
  });

  // Firebase notifies us here whenever the signed-in/out state changes —
  // this is what actually flips the app between the two screen sets below.
  // An unverified email is treated identically to signed-out (Option A:
  // login is blocked entirely until verification), so the user only ever
  // reaches PINSetup/ModeSelection once emailVerified is true.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const verifiedUser = u && u.emailVerified ? u : null;
      setUser(verifiedUser);
    });
    return unsubscribe;
  }, []);

  // Reads this user's own Firestore doc once per sign-in to figure out
  // what onboarding, if any, is still outstanding. Administrators can't
  // skip connecting to an org, so orgStepSkipped only excuses everyone
  // else from needing one.
  useEffect(() => {
    if (!user) {
      setOnboardingStatus(undefined);
      return;
    }
    let cancelled = false;
    async function loadOnboardingStatus() {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (cancelled) return;
      const data = snap.data() ?? {};
      const needsPin = !data.pinHash;
      const needsOrg = data.role === 'Administrator'
        ? !data.orgId
        : !data.orgId && !data.orgStepSkipped;
      setOnboardingStatus({ needsPin, needsOrg });
    }
    loadOnboardingStatus();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user === undefined || !fontsLoaded || (user && !onboardingStatus)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2D9B8A" />
      </View>
    );
  }

  const initialRouteName = !user
    ? 'Welcome'
    : onboardingStatus.needsPin
    ? 'PINSetup'
    : onboardingStatus.needsOrg
    ? 'JoinCreateOrganization'
    : 'ModeSelection';

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
        initialRouteName={initialRouteName}
      >
        {user ? (
          <>
            {/* Onboarding, shown only right after sign-up */}
            <Stack.Screen name="PINSetup" component={PINSetupScreen} />
            <Stack.Screen name="JoinCreateOrganization" component={JoinCreateOrganizationScreen} />
            <Stack.Screen name="JoinOrganization" component={JoinOrganizationScreen} />
            <Stack.Screen name="CreateOrganization" component={CreateOrganizationScreen} />

            {/* The post-login hub, plus screens reachable from anywhere.
                animation is dynamic (not a fixed screenOption) because this
                screen is reached both going forward (finishing onboarding)
                and going "back" out of a mode — the back-style callers pass
                params.animation: 'slide_from_left' so the transition mirrors
                a real pop instead of looking like another forward push. */}
            <Stack.Screen
              name="ModeSelection"
              component={ModeSelectionScreen}
              options={({ route }) => ({ animation: route.params?.animation ?? 'default' })}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            {/* "Change Username" on SettingsScreen. */}
            <Stack.Screen name="ChangeUsername" component={ChangeUsernameScreen} />
            {/* Reusable PIN check — every mode entry (and Resident Mode's
                exit) routes through here with a `destination` param.
                transparentModal keeps the screen underneath mounted and
                visible instead of unmounting it, which is what lets
                PINEntryScreen's own dark overlay show it dimmed behind
                the floating card. */}
            <Stack.Screen
              name="PINEntry"
              component={PINEntryScreen}
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            {/* "Forgot PIN?" on PINEntryScreen — re-verifies the user's
                password, then hands off to PINSetup in reset mode. */}
            <Stack.Screen name="ForgotPin" component={ForgotPinScreen} />
            {/* Also reachable from SettingsScreen's "Change Password" row,
                pre-filled with the signed-in user's email. */}
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

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
                Home icon, which goes through the PIN gate. animation is
                dynamic for the same reason as ModeSelection above: entering
                from ModeSelectionScreen is a forward push, but arriving via
                ActivityMenuScreen's PIN-gated back button is conceptually a
                back navigation and passes params.animation accordingly. */}
            <Stack.Screen
              name="ResidentMode"
              component={ResidentModeScreen}
              options={({ route }) => ({
                gestureEnabled: false,
                animation: route.params?.animation ?? 'default',
              })}
            />
            <Stack.Screen name="ActivityMenu" component={ActivityMenuScreen} />
            <Stack.Screen name="GuidedMeditation" component={GuidedMeditationScreen} />
            <Stack.Screen name="MusicSelection" component={MusicSelectionScreen} />
            <Stack.Screen name="MusicPlayer" component={MusicPlayerScreen} />
            <Stack.Screen name="Games" component={GamesScreen} />
            <Stack.Screen name="WordGames" component={WordGamesScreen} />
            <Stack.Screen name="Trivia" component={TriviaScreen} />
            <Stack.Screen name="PhotoAlbum" component={PhotoAlbumScreen} />
            <Stack.Screen name="MoviesVideos" component={MoviesVideosScreen} />
            <Stack.Screen name="Molehunt" component={MolehuntScreen} />

            {/* Shared screens used across multiple modes (mainly
                Caregiver Mode's quick links, and Resident Mode's
                Add Resident / resident-info-edit shortcuts) */}
            <Stack.Screen name="AddResident" component={AddResidentScreen} />
            <Stack.Screen name="SelectOrganizationResident" component={SelectOrganizationResidentScreen} />
            <Stack.Screen name="BuildProfile" component={BuildProfileScreen} />
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
            {/* "Forgot password?" on SignInScreen — sends a Firebase Auth
                password reset email. */}
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            {/* Reached right after sign-up, while the account exists in
                Firebase Auth but isn't verified yet — still part of the
                signed-out stack since `user` above is null until then.
                Rendered via a children function (instead of `component`)
                so we can pass onVerified, which hands the now-verified
                user back to onAuthStateChanged's next check without
                EmailVerificationScreen needing to know about App's state.
                The onboarding-status effect above then naturally routes a
                brand-new user to PINSetup, since they won't have a
                pinHash yet. */}
            <Stack.Screen name="EmailVerification">
              {(props) => (
                <EmailVerificationScreen
                  {...props}
                  onVerified={() => setUser(auth.currentUser)}
                />
              )}
            </Stack.Screen>
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
