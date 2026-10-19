// The public home page (the "Overview" tab): a short product tour of the Welicare iPad app for
// care homes and families visiting the site. Its calls to action lead to the
// Contact page, since the site's current job is finding pilot sites.
//
// The "screenshots" are drawn in HTML/CSS (DeviceFrame + the *Demo
// components) rather than images, so they stay crisp, use the shared theme
// colours and never go stale with a real resident's photo or name in them.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';

// Main features, following the README's "Main Features" list. Each card's
// accent is the matching activity colour from the app's theme.
const FEATURES = [
  {
    title: 'Life-story profiles',
    body: 'A guided, optional questionnaire, filled in with family or the resident, collects their preferred name, hometown, career, family, hobbies and favourite music.',
    accent: 'photoAlbum',
  },
  {
    title: 'Personalized with AI',
    body: 'Each profile becomes trivia questions, conversation starters, activity ideas and music and movie suggestions about that person’s own life, not generic bingo.',
    accent: 'trivia',
  },
  {
    title: 'Curated music & video',
    body: 'A starter set of 80+ music videos, plus a shared library staff and family build from YouTube. Residents only browse what’s been chosen for them.',
    accent: 'music',
  },
  {
    title: 'A Resident Mode to hand over',
    body: 'Big, simple activity tiles with a PIN lock, so a resident can explore on their own without wandering into staff screens. Guest mode covers group sessions.',
    accent: 'games',
  },
  {
    title: 'Organizations & approvals',
    body: 'Care homes join with an invite code like MGK7-4TXR, and administrators approve each request. Residents and music libraries belong to the facility.',
    accent: 'conversation',
  },
  {
    title: 'Designed for older adults',
    body: 'Atkinson Hyperlegible type made for low vision, a high-contrast palette, and labels on every control for VoiceOver and TalkBack.',
    accent: 'meditation',
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

// The Mode Selection screen everyone lands on after signing in (the
// README's first screenshot), styled after ModeSelectionScreen: a big
// Resident Mode card, then the staff and family modes, each behind a PIN.
function ModeSelectionDemo() {
  const modes = ['Family Mode', 'Caregiver Mode', 'Volunteer Mode', 'Admin Mode'];
  return (
    <div className="demo">
      <p className="demo-title">How are you using Welicare today?</p>
      <div className="demo-resident-card">
        <strong>Resident Mode</strong>
        <span>Music, trivia, photo albums and more</span>
      </div>
      <div className="demo-modes">
        {modes.map((m) => (
          <div key={m} className="demo-mode">
            {m}
            <span className="demo-pin">PIN</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A caregiver's AI conversation starters, written from the (made-up)
// resident's life story.
function ConversationDemo() {
  const starters = [
    'What was harvest time like on the farm?',
    'Which Patsy Cline song would you sing along to?',
    'Tell me about the river in Saskatoon.',
  ];
  return (
    <div className="demo">
      <p className="demo-kicker">Conversation starters for Margaret</p>
      <p className="demo-title">From her life story</p>
      <div className="demo-list">
        {starters.map((q) => <span key={q}>{q}</span>)}
      </div>
    </div>
  );
}

// The resident's photo album as family see it: shared photos (drawn as
// soft colour gradients in the activity colours, never real photos) and an "Add photos" button.
function PhotoAlbumDemo() {
  const tiles = ['photoAlbum', 'music', 'meditation', 'conversation', 'games', 'trivia'];
  return (
    <div className="demo">
      <p className="demo-kicker">Shared by her daughter</p>
      <p className="demo-title">Margaret’s photo album</p>
      <div className="demo-photos">
        {tiles.map((t) => <span key={t} style={{ background: `linear-gradient(160deg, var(--act-${t}-bg) 35%, var(--act-${t}-icon))` }} />)}
      </div>
      <span className="demo-pill">Add photos</span>
    </div>
  );
}

// One section per role: residents, caregivers, family. Each row is a drawn
// screen next to what that person gets, alternating sides on wide screens
// (see .role in styles.css). The points follow the README.
const ROLES = [
  {
    id: 'residents',
    label: 'Resident view',
    accent: 'games',
    title: 'A calm, simple space made to be handed over',
    summary: 'Resident Mode holds every activity a resident uses, on big, colourful tiles that are easy to see and tap.',
    points: [
      'Music, trivia, conversation, games, photos, guided meditation and movies, one tap away',
      'Games with big targets, no timers and no way to lose, just warm encouragement',
      'A PIN lock, so residents can explore freely but can’t leave for staff screens',
      'Guest mode for group activities, or before a profile has been made',
    ],
    caption: 'Resident Mode: every activity one big tap away',
    Demo: ActivityMenuDemo,
  },
  {
    id: 'caregivers',
    label: 'Caregivers',
    accent: 'conversation',
    title: 'Every session prepared before you sit down',
    summary: 'For recreation therapists and staff caregivers: everyone in your facility, and ideas made for each of them.',
    points: [
      'See and update the profiles of every resident in your facility',
      'AI activity ideas, conversation starters and music and movie suggestions from each life story',
      'Build the facility’s music and video library, and choose what each resident can see',
      'Track engagement across residents with overall stats',
    ],
    caption: 'Conversation starters written from the resident’s own life',
    Demo: ConversationDemo,
  },
  {
    id: 'family',
    label: 'Family members',
    accent: 'photoAlbum',
    title: 'Share what only family knows',
    summary: 'The details that make a visit land often live with family. Welicare gives them a place to go.',
    points: [
      'Help fill in the life-story questionnaire: hometown, work, family, favourite songs',
      'Share photos to their loved one’s album, ready for the next visit',
      'View the profile and recent activity once they’re in a care home',
      'Caring at home? You get your own family organization to manage everything',
    ],
    caption: 'Family photos, shared straight to the resident’s album',
    Demo: PhotoAlbumDemo,
  },
] as const;

export default function LandingPage() {
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
            <Link className="button secondary" to="/contact">Pilot Welicare at your site</Link>
          </div>
        </div>
        {/* The resident menu has its own row further down (ROLES), so the
            hero shows the screen that ties the roles together. */}
        <DeviceFrame caption="One app, with a mode for each person in the circle of care">
          <ModeSelectionDemo />
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

      <section id="roles" className="section roles" aria-labelledby="roles-heading">
        <h2 id="roles-heading">A mode for everyone in the circle of care</h2>
        {ROLES.map(({ id, label, accent, title, summary, points, caption, Demo }) => (
          <article key={id} id={id} className="role" aria-labelledby={`${id}-title`}>
            <DeviceFrame caption={caption}>
              <Demo />
            </DeviceFrame>
            <div className="role-copy">
              {/* The pill uses an activity pair (dark icon colour on its pale
                  tile), the same contrast the app uses on its tiles. */}
              <p className="role-label" style={{ background: `var(--act-${accent}-bg)`, color: `var(--act-${accent}-icon)` }}>
                {label}
              </p>
              <h3 id={`${id}-title`}>{title}</h3>
              <p className="role-summary">{summary}</p>
              <ul className="role-points">
                {points.map((pt) => <li key={pt}>{pt}</li>)}
              </ul>
            </div>
          </article>
        ))}
        <aside className="role-others" aria-label="Administrators and volunteers">
          <p>
            <strong>Administrators</strong> approve join requests, manage users and organization
            settings, and see an activity log. <strong>Volunteers</strong> can view residents, run
            sessions and track their hours, without editing profiles.
          </p>
        </aside>
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
        <p>Welicare is looking for care homes to pilot the app. I'd love to hear from you.</p>
        <Link className="button" to="/contact">Interested in a pilot? Get in touch</Link>
      </section>
    </SiteLayout>
  );
}
