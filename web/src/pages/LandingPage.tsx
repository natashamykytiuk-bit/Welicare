// The public home page (the "Overview" tab): a short product tour of the Welicare iPad app for
// care homes and families visiting the site. Its calls to action lead to the
// Contact page, since the site's current job is finding pilot sites.
//
// The "screenshots" are drawn in HTML/CSS (DeviceFrame + the *Demo
// components) rather than images, so they stay crisp, use the shared theme
// colours and never go stale with a real resident's photo or name in them.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';

// Line icons for the feature badges (24×24, drawn with `currentColor` so the
// badge's accent colour tints them). Decorative only: the card's heading
// already says what each one is.
const FEATURE_ICONS = {
  // A person: the resident whose life story is collected.
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  // A sparkle: AI-made content.
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16v4M17 18h4" /></>,
  // A music note.
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  // A padlock: Resident Mode's PIN lock.
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  // A building: the care facility.
  building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M2 21h20M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4" /></>,
  // An eye: legibility and low vision.
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
} as const;

// Main features, following the README's "Main Features" list. Each card's
// accent is an activity colour from the app's theme, picked so no two
// neighbouring cards (across a row or down a column of the 3×2 grid) share
// a hue — the brown and terracotta pair sit in opposite corners.
const FEATURES = [
  {
    title: 'Life-story profiles',
    body: 'A guided questionnaire, filled in with family or the resident, collects their preferred name, hometown, hobbies, and favourite music.',
    accent: 'photoAlbum',
    icon: 'profile',
  },
  {
    title: 'Personalized with AI',
    body: 'Each profile becomes trivia questions, conversation starters, activity ideas and music and movie suggestions about that person’s own life.',
    accent: 'meditation',
    icon: 'sparkle',
  },
  {
    title: 'Curated music & video',
    body: 'A starter set of 80+ music videos, plus a shared library staff and family build from YouTube. Residents only browse what’s been chosen for them.',
    accent: 'music',
    icon: 'music',
  },
  {
    title: 'A Resident Mode to hand over',
    body: 'Big, simple activity tiles with a PIN lock, so a resident can explore on their own.',
    accent: 'games',
    icon: 'lock',
  },
  {
    title: 'Organizations & approvals',
    body: 'Caregivers join with an invite code, and administrators approve each request. Residents and music libraries belong to the facility.',
    accent: 'conversation',
    icon: 'building',
  },
  {
    title: 'Designed for older adults',
    body: 'Atkinson Hyperlegible type made for low vision, a high-contrast palette, and labels on every control for VoiceOver and TalkBack.',
    accent: 'trivia',
    icon: 'eye',
  },
] as const;

// Steps of a one-on-one session, shown in the "How it works" strip.
const STEPS = [
  ['Build the profile', 'Family and staff add the resident’s life story once.'],
  ['Pick an activity', 'Open Resident Mode on the shared iPad and choose music, trivia, a game or photos.'],
  ['Share the moment', 'Sit together while Welicare does the preparation, and log the visit afterwards.'],
] as const;

// An iPad-shaped frame for the drawn screens. Hidden from screen readers:
// the caption under each one says what it shows. `interactive` frames hold
// real links (the hero's mode buttons), so they stay visible to assistive
// tech: focusable links inside aria-hidden would be unreachable by name.
function DeviceFrame({ children, caption, interactive = false }: { children: ReactNode; caption: string; interactive?: boolean }) {
  return (
    <figure className="device">
      <div className="device-bezel" aria-hidden={interactive ? undefined : true}>
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
// Each mode links down to its row in the roles section (ROLES ids).
function ModeSelectionDemo() {
  const modes = [
    ['Family Mode', '#family'],
    ['Caregiver Mode', '#caregivers'],
    ['Volunteer Mode', '#volunteers'],
    ['Admin Mode', '#administrators'],
  ];
  return (
    <div className="demo">
      <p className="demo-title">How are you using Welicare today?</p>
      <a className="demo-resident-card" href="#residents">
        <strong>Resident Mode</strong>
        <span>Music, trivia, photo albums and more</span>
      </a>
      <div className="demo-modes">
        {modes.map(([m, href]) => (
          <a key={m} className="demo-mode" href={href}>
            {m}
            {/* Decorative: "PIN" would otherwise be read as part of the link name. */}
            <span className="demo-pin" aria-hidden="true">PIN</span>
          </a>
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

// An administrator's join requests: people who entered the facility's
// invite code, waiting for approval. Names are made up.
function JoinRequestsDemo() {
  const requests = [
    ['Priya S.', 'Caregiver'],
    ['Tom W.', 'Volunteer'],
    ['Linda M.', 'Family member'],
  ];
  return (
    <div className="demo">
      <p className="demo-kicker">Invite code MGK7-4TXR</p>
      <p className="demo-title">Join requests</p>
      <div className="demo-list demo-rows">
        {requests.map(([name, role]) => (
          <span key={name} style={{ background: 'var(--act-trivia-bg)' }}>
            <span>{name} · {role}</span>
            <span className="demo-pill">Approve</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// A volunteer's logged sessions and running total of hours.
function VolunteerHoursDemo() {
  const sessions = [
    ['Margaret · Music', '45 min'],
    ['Walter · Trivia', '30 min'],
    ['Group · Photo stories', '1 hr'],
  ];
  return (
    <div className="demo">
      <p className="demo-kicker">This month · 12.5 hours</p>
      <p className="demo-title">Your sessions</p>
      <div className="demo-list demo-rows">
        {sessions.map(([what, time]) => (
          <span key={what} style={{ background: 'var(--act-music-bg)' }}>
            <span>{what}</span>
            <strong>{time}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// One tab per role: residents, caregivers, family, volunteers, administrators.
// Each panel is a drawn screen beside what that person gets (see RoleTabs and
// .role in styles.css). The points follow the README.
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
  {
    id: 'volunteers',
    label: 'Volunteers',
    accent: 'music',
    title: 'Ready to help from your first visit',
    summary: 'Volunteers get everything they need to run a good session, without the responsibility of managing profiles.',
    points: [
      'View residents’ profiles and the ideas made for each of them',
      'Run one-on-one or group sessions with every activity',
      'Track your volunteer hours as you go',
      'Profiles stay read-only, so records stay in staff hands',
    ],
    caption: 'Every session counted toward your volunteer hours',
    Demo: VolunteerHoursDemo,
  },
  {
    id: 'administrators',
    label: 'Administrators',
    accent: 'trivia',
    title: 'Your facility, set up and secure',
    summary: 'Administrators decide who joins the facility and keep its settings in order.',
    points: [
      'Share one invite code and approve each request to join',
      'Manage users and their roles',
      'Update organization settings',
      'Review an activity log of changes across the facility',
    ],
    caption: 'Join requests waiting for approval',
    Demo: JoinRequestsDemo,
  },
] as const;

type RoleId = (typeof ROLES)[number]['id'];

// Reads a role id from the URL hash (e.g. "#family"), so the hero's mode
// buttons and shared links can open the matching tab. Anything else is null.
function roleFromHash(): RoleId | null {
  const id = window.location.hash.slice(1);
  return ROLES.some((r) => r.id === id) ? (id as RoleId) : null;
}

// The roles section as browser-style tabs: one line of modes, and the
// selected one's screen and writeup in a panel underneath. Showing one role
// at a time keeps the page short on phones (five stacked rows was most of
// the scroll). Follows the WAI-ARIA tabs pattern: arrow keys move between
// tabs, and only the selected tab is in the Tab order.
function RoleTabs() {
  const [active, setActive] = useState<RoleId>(() => roleFromHash() ?? 'residents');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The hero's mode links change the hash (#caregivers, ...). The tab
  // buttons carry those ids, so the browser scrolls to the tab row, and this
  // listener selects the matching tab.
  useEffect(() => {
    const onHash = () => {
      const r = roleFromHash();
      if (r) setActive(r);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // replaceState rather than setting location.hash: it keeps the URL
  // shareable without making the browser jump the page to the tab.
  const select = (id: RoleId) => {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  // Left/Right (and Home/End) move selection and focus along the tab row.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ROLES.findIndex((r) => r.id === active);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ROLES.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = ROLES[(next + ROLES.length) % ROLES.length].id;
    select(id);
    tabRefs.current[id]?.focus();
  };

  const role = ROLES.find((r) => r.id === active) ?? ROLES[0];
  const { Demo } = role;
  return (
    <>
      <div className="role-tabs" role="tablist" aria-labelledby="roles-heading" onKeyDown={onKeyDown}>
        {ROLES.map(({ id, label, accent }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              id={id}
              ref={(el) => { tabRefs.current[id] = el; }}
              type="button"
              role="tab"
              className="role-tab"
              aria-selected={selected}
              aria-controls="role-panel"
              tabIndex={selected ? 0 : -1}
              // The selected tab takes its mode's pale tile colour, the same
              // pair the app uses, and the panel below matches it.
              style={selected ? { background: `var(--act-${accent}-bg)`, color: `var(--act-${accent}-icon)` } : undefined}
              onClick={() => select(id)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <article
        id="role-panel"
        className="role"
        role="tabpanel"
        aria-labelledby={role.id}
        style={{ borderTopColor: `var(--act-${role.accent}-icon)` }}
      >
        <DeviceFrame caption={role.caption}>
          <Demo />
        </DeviceFrame>
        <div className="role-copy">
          <h3>{role.title}</h3>
          <p className="role-summary">{role.summary}</p>
          <ul className="role-points">
            {role.points.map((pt) => <li key={pt}>{pt}</li>)}
          </ul>
        </div>
      </article>
    </>
  );
}

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
        <DeviceFrame interactive caption="One app, with a mode for each person in the circle of care">
          <ModeSelectionDemo />
        </DeviceFrame>
      </section>

      <section id="features" className="section">
        <h2>Everything a visit needs, prepared in advance</h2>
        <p className="section-dek">
          Personalized trivia and conversation from each resident’s life story, with music and videos chosen for them.
        </p>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <span
                className="feature-badge"
                aria-hidden="true"
                style={{ background: `var(--act-${f.accent}-bg)`, color: `var(--act-${f.accent}-icon)` }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {FEATURE_ICONS[f.icon]}
                </svg>
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
        {/* The two demos sit here, right under the features they show, rather
            than in a separate unlabelled strip further down the page. */}
        <div className="showcase">
          <DeviceFrame caption="Trivia written from the resident’s own life">
            <TriviaDemo />
          </DeviceFrame>
          <DeviceFrame caption="Songs from their era, ready to play">
            <MusicDemo />
          </DeviceFrame>
        </div>
      </section>

      <section id="roles" className="section roles" aria-labelledby="roles-heading">
        <h2 id="roles-heading">A mode for everyone in the circle of care</h2>
        <p className="section-dek">
          Residents, caregivers, family, volunteers and administrators each get their own view.
        </p>
        <RoleTabs />
      </section>

      <section id="how" className="section">
        <h2>How it works</h2>
        <p className="section-dek">Three steps from a resident’s story to a shared moment.</p>
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
        <p>Welicare is looking for care homes to pilot the app. We'd love to hear from you.</p>
        <Link className="button" to="/contact">Interested in a pilot? Get in touch</Link>
      </section>
    </SiteLayout>
  );
}
