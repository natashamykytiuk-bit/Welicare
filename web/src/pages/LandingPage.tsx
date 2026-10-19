// The public home page (the "Overview" tab): a short product tour of the Welicare iPad app for
// care homes and families visiting the site. Everyone lands here, signed in
// or not. The portal itself (approvals and, later, the rest of the admin
// tools) sits behind the "Sign in" button. A signed-in person instead sees
// "Open your dashboard", which goes to their own home (homePathFor).
//
// The "screenshots" are drawn in HTML/CSS (DeviceFrame + the *Demo
// components) rather than images, so they stay crisp, use the shared theme
// colours and never go stale with a real resident's photo or name in them.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import SiteLayout, { usePortalLink } from '../components/SiteLayout';

// Main features, in the order a care team meets them. Each card's accent is
// the matching activity colour from the app's theme.
const FEATURES = [
  {
    title: 'Life-story profiles',
    body: 'Where they grew up, the work they did, the songs they loved. Every resident’s story lives in one place the whole team can use.',
    accent: 'photoAlbum',
  },
  {
    title: 'Personalized trivia & conversation',
    body: 'AI turns each profile into questions and conversation starters about that person’s own life, not generic bingo.',
    accent: 'trivia',
  },
  {
    title: 'Music and videos they’ll recognize',
    body: 'A library built around each resident’s favourite artists and era, ready to play with one tap.',
    accent: 'music',
  },
  {
    title: 'Gentle games',
    body: 'Memory Match, Molehunt and word games with big targets, no timers and no way to lose, just warm encouragement.',
    accent: 'games',
  },
  {
    title: 'Guided meditation & photo albums',
    body: 'Calming sessions and family photos for quieter moments, side by side with a caregiver.',
    accent: 'meditation',
  },
  {
    title: 'Built for the whole care team',
    body: 'Administrators, staff caregivers, volunteers and family each get their own mode, with approvals, hours and activity logs.',
    accent: 'conversation',
  },
] as const;

// Steps of a one-on-one session, shown in the "How it works" strip.
const STEPS = [
  ['Build the profile', 'Family and staff add the resident’s life story once.'],
  ['Pick an activity', 'Open Resident Mode on the shared iPad and choose music, trivia, a game or photos.'],
  ['Share the moment', 'Sit together while Welicare does the preparation, and log the visit afterwards.'],
] as const;

// An iPad-shaped frame for the drawn screens. Hidden from screen readers:
// the caption under each one says what it shows.
function DeviceFrame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="device">
      <div className="device-bezel" aria-hidden="true">
        <div className="device-screen">{children}</div>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Resident Mode's activity menu: big, colourful tiles.
// Styled to match the app's ActivityMenuScreen: two columns of pastel tiles
// (the activity's `bg` colour) with an outline icon and label in the main
// text colour, not the activity's accent.
function ActivityMenuDemo() {
  // Simple outline stand-ins for the app's Ionicons, drawn as SVG paths.
  const tiles = [
    ['Music Player', 'music', 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
    ['Trivia', 'trivia', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
    ['Games', 'games', 'M6 8h12a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8Zm2 2v4m-2-2h4m5 0h.01M17 11h.01'],
    ['Meditation', 'meditation', 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7'],
    ['Photo Album', 'photoAlbum', 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01'],
    ['Movies & Videos', 'moviesVideos', 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4m-4 5h4m8-5h4m-4 5h4'],
  ];
  return (
    <div className="demo">
      <p className="demo-title">Good morning, Margaret.</p>
      <div className="demo-tiles">
        {tiles.map(([label, key, path]) => (
          <div key={key} className="demo-tile" style={{ background: `var(--act-${key}-bg)` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={path} />
            </svg>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// A trivia question generated from the (made-up) resident's profile.
function TriviaDemo() {
  return (
    <div className="demo">
      <p className="demo-kicker">You grew up near Saskatoon</p>
      <p className="demo-title">Which river runs through the city?</p>
      <div className="demo-answers">
        <span>South Saskatchewan River</span>
        <span>Fraser River</span>
        <span>Red River</span>
      </div>
    </div>
  );
}

// The music player with a familiar song from the resident's era.
function MusicDemo() {
  return (
    <div className="demo demo-music">
      <div className="demo-cover" />
      <p className="demo-title">Crazy</p>
      <p className="demo-kicker">Patsy Cline · 1961</p>
      <div className="demo-progress"><span /></div>
      <div className="demo-play" />
    </div>
  );
}

export default function LandingPage() {
  const { signedIn, portalLink } = usePortalLink();

  return (
    <SiteLayout>
      <section className="hero">
        <div className="hero-copy">
          <h1>Meaningful one&#8209;on&#8209;one time for people living with dementia</h1>
          <p className="lead">
            Welicare is an iPad app that turns each resident’s life story into personalized
            music, trivia, conversation and gentle games, so every visit feels like it was made
            just for them.
          </p>
          <div className="hero-actions">
            <a className="button" href="#features">See what it does</a>
            {signedIn ? portalLink : <Link className="button secondary" to="/login">Administrator sign in</Link>}
          </div>
        </div>
        <DeviceFrame caption="Resident Mode: every activity one big tap away">
          <ActivityMenuDemo />
        </DeviceFrame>
      </section>

      <section id="features" className="section">
        <h2>Everything a visit needs, prepared in advance</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature" style={{ borderTopColor: `var(--act-${f.accent}-icon)` }}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section showcase">
        <DeviceFrame caption="Trivia written from the resident’s own life">
          <TriviaDemo />
        </DeviceFrame>
        <DeviceFrame caption="Songs from their era, ready to play">
          <MusicDemo />
        </DeviceFrame>
      </section>

      <section id="how" className="section">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section cta">
        <h2>Running a care home?</h2>
        <p>
          Welicare is looking for pilot sites. Administrators already using it sign in here to
          approve staff and manage their organization.
        </p>
        <div className="cta-actions">
          <Link className="button" to="/contact">Interested in a pilot? Get in touch</Link>
          {portalLink}
        </div>
      </section>
    </SiteLayout>
  );
}
