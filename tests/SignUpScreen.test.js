// Tests for Phase C: sign-up can be resumed instead of getting stuck.
//
// What each test pins down:
// - An email that's already registered gets a kind "sign in to finish"
//   message, not a generic error.
// - Once the Auth account exists, a failed profile write or a failed
//   verification email doesn't fail the sign-up — it moves on to the
//   verification screen with a note, so nothing is stranded.
// - "Finish setting up" mode (for a signed-in account with no profile)
//   only ever creates a missing profile, and never touches an existing one
//   — so a role can't be changed this way.
//
// fillForm() drives the form the way a person would: typing into fields
// found by their accessibility labels, opening the country dropdown and
// tapping an option, and tapping a role card.

import { fireEvent, render, screen } from '@testing-library/react-native';
import SignUpScreen from '../screens/SignUpScreen';
import { auth, authModule, docSnap, firestore } from './mocks/firebase';

const navigation = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

async function fillForm({ withCredentials = true } = {}) {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ann Smith');
  if (withCredentials) {
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'ann@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd');
  }
  await fireEvent.changeText(screen.getByLabelText('Username'), 'ann.smith');
  await fireEvent.press(screen.getByLabelText('Select your country'));
  await fireEvent.press(await screen.findByLabelText('Canada'));
  await fireEvent.press(screen.getByLabelText('Caregiver'));
}

let consoleError;
beforeEach(() => {
  navigation.navigate.mockReset();
  navigation.reset.mockReset();
  // Failure paths console.error on purpose; keep output readable.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  // Username is free unless a test says otherwise.
  firestore.getDoc.mockResolvedValue(docSnap(undefined));
});
afterEach(() => consoleError.mockRestore());

describe('sign-up', () => {
  it('explains kindly when the email is already registered, with a sign-in link', async () => {
    authModule.createUserWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error('in use'), { code: 'auth/email-already-in-use' })
    );
    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm();
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(await screen.findByText(/started signing up before/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sign in to finish setting up'));
    expect(navigation.navigate).toHaveBeenCalledWith('SignIn');
  });

  it('still reaches verification when the verification email fails to send', async () => {
    authModule.createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'new-user' } });
    firestore.setDoc.mockResolvedValue(undefined);
    authModule.sendEmailVerification.mockRejectedValueOnce(new Error('smtp down'));

    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm();
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'EmailVerification',
      expect.objectContaining({ verificationSendFailed: true, setupIncomplete: false })
    );
  });

  it('keeps the account and flags it when the profile fails to save', async () => {
    authModule.createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'new-user' } });
    firestore.setDoc.mockRejectedValueOnce(new Error('offline'));
    authModule.sendEmailVerification.mockResolvedValueOnce(undefined);

    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm();
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(authModule.deleteUser).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith(
      'EmailVerification',
      expect.objectContaining({ setupIncomplete: true })
    );
  });
});

describe('finish setting up', () => {
  const finishRoute = { params: { finishSetup: true } };

  it('hides the email and password fields', async () => {
    await render(<SignUpScreen navigation={navigation} route={finishRoute} />);
    expect(screen.getByText('Finish setting up your account')).toBeTruthy();
    expect(screen.queryByLabelText('Email address')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('creates the missing profile and continues to PIN setup', async () => {
    auth.currentUser = { uid: 'half-done', email: 'ann@example.com' };
    firestore.getDoc
      .mockResolvedValueOnce(docSnap(undefined)) // no profile yet
      .mockResolvedValueOnce(docSnap(undefined)) // username free
      .mockResolvedValueOnce(docSnap({ role: 'Caregiver' })); // re-read after saving
    firestore.setDoc.mockResolvedValue(undefined);

    await render(<SignUpScreen navigation={navigation} route={finishRoute} />);
    await fillForm({ withCredentials: false });
    await fireEvent.press(screen.getByLabelText('Continue'));

    const profileWrite = firestore.setDoc.mock.calls.find(
      ([ref]) => ref.path === 'users/half-done'
    );
    expect(profileWrite[1]).toMatchObject({ role: 'Caregiver', email: 'ann@example.com' });
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'PINSetup' }] });
  });

  it('never overwrites a profile that already exists (role stays fixed)', async () => {
    auth.currentUser = { uid: 'has-profile', email: 'ann@example.com' };
    firestore.getDoc.mockReset();
    firestore.getDoc.mockResolvedValueOnce(
      docSnap({ role: 'Volunteer', pinHash: 'h', orgStepSkipped: true })
    );

    await render(<SignUpScreen navigation={navigation} route={finishRoute} />);
    await fillForm({ withCredentials: false }); // picks "Caregiver"
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'ModeSelection' }],
    });
  });
});
