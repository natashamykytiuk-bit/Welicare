// A simple message screen with a sign-out button: the volunteer "use the
// iPad app" screen, waiting-for-approval, and (until the real screens are
// built) each role's home, so login can be tested end to end.
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function InfoPage({ title, body }: { title: string; body: string }) {
  return (
    <main id="main" className="auth-card">
      <h1>{title}</h1>
      <p>{body}</p>
      <button type="button" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </main>
  );
}
