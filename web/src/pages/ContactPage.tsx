// "Contact": a short form for care homes, staff and families who want to
// hear more or pilot Welicare. Works signed out: each submission is one
// addDoc to contactRequests, and firestore.rules check the exact field set,
// lengths and role, so the form's limits here are only a convenience — the
// rules are what actually enforce them.
import { useState, type FormEvent } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';
import { db } from '../firebase';

// Must match the role list in firestore.rules (contactRequests).
const ROLES = [
  'Care home administrator',
  'Staff caregiver / recreation therapist',
  'Family member',
  'Other',
] as const;

// Max lengths, also enforced by firestore.rules.
const MAX = { name: 100, email: 200, organization: 150, message: 3000 };

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [message, setMessage] = useState('');
  const [wantsPilot, setWantsPilot] = useState(false);
  // Honeypot: hidden from people, but simple bots fill in every field.
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    // A filled honeypot is a bot: pretend it worked so it doesn't retry,
    // but save nothing.
    if (website) {
      setSent(true);
      return;
    }
    const clean = {
      name: name.trim(),
      email: email.trim(),
      organization: organization.trim(),
      message: message.trim(),
    };
    // `required` lets whitespace-only answers through; the rules would
    // reject them, so say so here instead of showing a generic failure.
    if (!clean.name || !clean.email || !clean.message) {
      setError('Please fill in your name, email and message.');
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'contactRequests'), {
        ...clean,
        role,
        wantsPilot,
        createdAt: serverTimestamp(),
        status: 'new',
      });
      setSent(true);
    } catch {
      // Keep everything they typed so they can just try again.
      setError('Sorry, your message couldn’t be sent. Please try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SiteLayout title="Contact">
      <article className="section story contact">
        <div className="hero story-hero">
          <h1>Get in touch</h1>
        </div>
        <p className="lead">
          Interested in learning more about Welicare, or in testing it at your site? I'd love to hear
          from you, whether you're a care home administrator, a recreation therapist, or a family
          member.
        </p>
        <p className="note-box">
          Welicare is not yet on the App Store. I'm currently looking for care homes to pilot the app.
        </p>

        {sent ? (
          // role="status" so screen readers announce the swap from the form.
          <div className="contact-thanks" role="status">
            <p>Thanks! I'll get back to you soon.</p>
            <Link className="button secondary" to="/">Back to the overview</Link>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit}>
            <label htmlFor="c-name">Name</label>
            <input id="c-name" name="name" required maxLength={MAX.name} autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)} />

            <label htmlFor="c-email">Email</label>
            <input id="c-email" name="email" type="email" required maxLength={MAX.email} autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />

            <label htmlFor="c-org">Organization / care home <span className="optional">(optional)</span></label>
            <input id="c-org" name="organization" maxLength={MAX.organization} autoComplete="organization"
              value={organization} onChange={(e) => setOrganization(e.target.value)} />

            <label htmlFor="c-role">I am a…</label>
            <select id="c-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            <label htmlFor="c-message">Message</label>
            <textarea id="c-message" name="message" required maxLength={MAX.message} rows={6}
              value={message} onChange={(e) => setMessage(e.target.value)} />

            <label className="checkbox">
              <input type="checkbox" checked={wantsPilot} onChange={(e) => setWantsPilot(e.target.checked)} />
              I'm interested in piloting Welicare at my site
            </label>

            {/* Honeypot: off-screen, unfocusable and hidden from assistive tech. */}
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="c-website">Website</label>
              <input id="c-website" name="website" tabIndex={-1} autoComplete="off"
                value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
          </form>
        )}
      </article>
    </SiteLayout>
  );
}
