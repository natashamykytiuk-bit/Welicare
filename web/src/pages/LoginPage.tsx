// Email/password sign-in with existing accounts (no sign-up on web). The
// error message is deliberately generic so it doesn't reveal which emails
// have accounts.
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { homePathFor } from '../auth/routing';
import { auth } from '../firebase';

export default function LoginPage() {
  const { user, profile, loading, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={homePathFor(profile)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('That email and password don’t match. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const message = error || authError;
  return (
    <main id="main" className="auth-card">
      <h1>Sign in to Welicare</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={message ? 'login-error' : undefined}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {message && (
          <p id="login-error" role="alert" className="form-error">
            {message}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <Link to="/reset-password">Forgot your password?</Link>
      </p>
    </main>
  );
}
