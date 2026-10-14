// Signing in with a username. The app can't sign in with a username
// directly — Firebase Auth needs the email — so it asks the
// resolveSignInEmail Cloud Function, which only gives the email to someone
// who also has the password. These check the screen sends both, never asks
// the function when an email was typed, and gives the same "incorrect"
// message whether the username or the password was wrong.
import { fireEvent, render, screen } from '@testing-library/react-native';
import SignInScreen from '../screens/SignInScreen';
import { authModule, callable } from './mocks/firebase';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function signIn(emailOrUsername, password = 'my-password') {
  await render(<SignInScreen navigation={navigation} route={{ params: {} }} />);
  await fireEvent.changeText(screen.getByLabelText('Email or username'), emailOrUsername);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByLabelText('Sign in'));
}

describe('SignInScreen', () => {
  it('sends the username AND password to be checked, then signs in with the email', async () => {
    callable('resolveSignInEmail').mockResolvedValueOnce({ data: { email: 'ann@example.com' } });
    authModule.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { emailVerified: true },
    });

    await signIn(' ann.smith ');

    expect(callable('resolveSignInEmail')).toHaveBeenCalledWith({
      username: 'ann.smith',
      password: 'my-password',
    });
    expect(authModule.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'ann@example.com',
      'my-password'
    );
  });

  it('signs in directly when an email address was typed', async () => {
    authModule.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { emailVerified: true },
    });

    await signIn('ann@example.com');

    expect(callable('resolveSignInEmail')).not.toHaveBeenCalled();
    expect(authModule.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'ann@example.com',
      'my-password'
    );
  });

  // The function answers not-found for an unknown username and for a wrong
  // password alike, so the screen can't tell them apart either.
  it('says "incorrect email or password" when the username or password is wrong', async () => {
    callable('resolveSignInEmail').mockRejectedValueOnce({ code: 'functions/not-found' });

    await signIn('ann.smith', 'a wrong guess');

    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    expect(authModule.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('says so when there have been too many attempts', async () => {
    callable('resolveSignInEmail').mockRejectedValueOnce({ code: 'functions/resource-exhausted' });

    await signIn('ann.smith');

    expect(
      await screen.findByText('Too many failed attempts. Please try again later.')
    ).toBeTruthy();
    expect(authModule.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});
