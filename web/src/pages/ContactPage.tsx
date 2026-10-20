// "Contact": a short form for care homes, staff and families who want to
// hear more or pilot Welicare. Works signed out: each submission calls the
// submitContactRequest Cloud Function (functions/contactRequest.js), which
// checks the fields, rate-limits each IP address and writes the message.
// Browsers can't write contactRequests directly (firestore.rules), so the
// form's limits here are only a convenience.
import { useState, type FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';
import { functions } from '../firebase';

const submitContactRequest = httpsCallable(functions, 'submitContactRequest');

// Must match ROLES in functions/contactRequest.js.
const ROLES = [
  'Care home administrator',
  'Staff caregiver / recreation therapist',
  'Family member',
  'Other',
] as const;

// Max lengths, also enforced by the function.
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
    // `required` lets whitespace-only answers through; the function would
    // reject them, so say so here instead of showing a generic failure.
    if (!clean.name || !clean.email || !clean.message) {
      setError('Please fill in your name, email and message.');
      return;
    }
    setSending(true);
    try {
      await submitContactRequest({ ...clean, role, wantsPilot });
      setSent(true);
    } catch (err) {
      // Keep everything they typed so they can just try again.
      // resource-exhausted is the per-IP limit (functions/contactRequest.js).
      const code = (err as { code?: string }).code;
      setError(
        code === 'functions/resource-exhausted'
          ? 'You’ve sent several messages already. Please try again later.'
          : 'Sorry, your message couldn’t be sent. Please try again in a moment.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <SiteLayout
      title="Contact"
      description="Get in touch about Welicare, or ask about piloting the app at your care home. For administrators, recreation therapists and families."
    >
      <article className="section story contact">
        <div className="hero story-hero">
          <h1>Get in touch</h1>
        </div>
        <p className="lead">
          Interested in learning more about Welicare, or in testing it at your site? We would love to hear
          from you, whether you're a care home administrator, a recreation therapist, or a family
          member.
        </p>
        <p className="note-box">
          Welicare is not yet on the App Store. We are currently looking for pilot sites.
        </p>

        {sent ? (
          // role="status" so screen readers announce the swap from the form.
          <div className="contact-thanks" role="status">
            {/* Says what happened and what comes next, with the address
                they gave so they know where to look. */}
            <p>Thank you, your message was sent.</p>
            <p className="contact-thanks-detail">We'll reply to {email.trim()} as soon as we can.</p>
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
