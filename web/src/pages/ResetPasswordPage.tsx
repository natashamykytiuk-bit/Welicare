// Sends Firebase's password-reset email. Always shows the same confirmation,
// whether or not the address has an account, so emails can't be probed.
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { auth } from '../firebase';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // The continue link brings people back to sign in once the password is
    // changed. If this domain isn't an authorized Firebase Auth domain the
    // request is refused, so send the plain link instead.
    await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` })
      .catch(() => sendPasswordResetEmail(auth, email.trim()))
      .catch(() => {});
    setSent(true);
  }

  return (
    <main id="main" className="auth-card">
      <h1>Reset your password</h1>
      {sent ? (
        <p role="status">If an account uses that email, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Send reset link</button>
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
