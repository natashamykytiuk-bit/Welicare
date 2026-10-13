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
// - The age screen: a child is turned away before any account is created,
//   and can't get through by changing the birth year and trying again.
//
// fillForm() drives the form the way a person would: typing into fields
// found by their accessibility labels, opening the country dropdown and
// tapping an option, and tapping a role card.

import { fireEvent, render, screen } from '@testing-library/react-native';
import SignUpScreen from '../screens/SignUpScreen';
import { resetAgeGateForTests } from '../utils/ageGate';
import { auth, authModule, batches, docSnap, firestore } from './mocks/firebase';

const navigation = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

async function fillForm({ withCredentials = true, birthYear = '1970' } = {}) {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ann Smith');
  if (withCredentials) {
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'ann@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd');
  }
  await fireEvent.changeText(screen.getByLabelText('Username'), 'ann.smith');
  await fireEvent.press(screen.getByLabelText('Select your country'));
  await fireEvent.press(await screen.findByLabelText('Canada'));
  await fireEvent.press(screen.getByLabelText('Select your birth month'));
  await fireEvent.press(await screen.findByLabelText('March'));
  await fireEvent.changeText(screen.getByLabelText('Birth year'), birthYear);
  await fireEvent.press(screen.getByLabelText('Caregiver'));
}

// Makes the next writeBatch() the screen creates reject on commit — the
// profile and username claim are saved as one batch (writeProfile).
function failNextBatch(error) {
  firestore.writeBatch.mockImplementationOnce(() => {
    const batch = { ops: [], set: jest.fn(), update: jest.fn(), delete: jest.fn() };
    batch.commit = jest.fn().mockRejectedValue(error);
    batches.push(batch);
    return batch;
  });
}

let consoleError;
beforeEach(() => {
  navigation.navigate.mockReset();
  navigation.reset.mockReset();
  authModule.createUserWithEmailAndPassword.mockClear();
  resetAgeGateForTests();
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
    failNextBatch(new Error('offline'));
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

  // The profile and the username claim are one batch, so a clash saves
  // neither — there is no profile to delete afterwards (the rules wouldn't
  // allow that anyway).
  it('saves the profile and the username claim together in one batch', async () => {
    authModule.createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'new-user' } });
    authModule.sendEmailVerification.mockResolvedValueOnce(undefined);

    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm();
    await fireEvent.press(screen.getByLabelText('Continue'));

    const signUpBatch = batches[0];
    expect(signUpBatch.ops.map(([op, path]) => [op, path])).toEqual([
      ['set', 'users/new-user'],
      ['set', expect.stringMatching(/^usernames\//)],
    ]);
    expect(signUpBatch.commit).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  it('removes the new login and asks for another name when the username was just taken', async () => {
    const user = { uid: 'new-user' };
    authModule.createUserWithEmailAndPassword.mockResolvedValueOnce({ user });
    failNextBatch(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    authModule.deleteUser.mockResolvedValueOnce(undefined);
    // Looking again after the failed save finds the name now belongs to someone.
    firestore.getDoc.mockResolvedValue(docSnap({ uid: 'someone-else' }));
    // The first look (before the account is created) still found it free.
    firestore.getDoc.mockResolvedValueOnce(docSnap(undefined));

    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm();
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(await screen.findByText(/username was just taken/)).toBeTruthy();
    expect(authModule.deleteUser).toHaveBeenCalledWith(user);
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('age screen', () => {
  it('turns a child away before creating anything, and stays closed on a retry', async () => {
    const childYear = String(new Date().getFullYear() - 10);
    await render(<SignUpScreen navigation={navigation} route={{ params: {} }} />);
    await fillForm({ birthYear: childYear });
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(await screen.findByText(/can't create a Welicare account/)).toBeTruthy();

    // Changing the year to an adult's doesn't reopen the form.
    await fireEvent.changeText(screen.getByLabelText('Birth year'), '1970');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(screen.getByText(/can't create a Welicare account/)).toBeTruthy();

    expect(authModule.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
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

    await render(<SignUpScreen navigation={navigation} route={finishRoute} />);
    await fillForm({ withCredentials: false });
    await fireEvent.press(screen.getByLabelText('Continue'));

    const profileWrite = batches[0].ops.find(([, path]) => path === 'users/half-done');
    expect(profileWrite[2]).toMatchObject({ role: 'Caregiver', email: 'ann@example.com' });
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'PINSetup' }] });
  });

  it('never overwrites a profile that already exists (role stays fixed)', async () => {
    auth.currentUser = { uid: 'has-profile', email: 'ann@example.com' };
    firestore.getDoc.mockReset();
    firestore.getDoc.mockResolvedValueOnce(
      docSnap({ role: 'Volunteer', pinHash: 'h', orgId: 'o' })
    );

    await render(<SignUpScreen navigation={navigation} route={finishRoute} />);
    await fillForm({ withCredentials: false }); // picks "Caregiver"
    await fireEvent.press(screen.getByLabelText('Continue'));

    expect(batches).toHaveLength(0);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'ModeSelection' }],
    });
  });
});
