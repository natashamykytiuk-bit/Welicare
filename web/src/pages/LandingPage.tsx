// The public Home page: a showcase of the Welicare iPad app, built around its
// purpose, a caregiver or family member sitting one-on-one with a person
// living with dementia. It runs in the order a visitor needs: what it is, how
// a session works, what you do together, why it suits dementia, then who it's
// for. Calls to action lead to the Contact page; the site doesn't handle
// accounts. The drawn screens live in components/LandingDemos.tsx.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router';
import {
  ActivityMenuDemo,
  ConversationDemo,
  DeviceFrame,
  JoinRequestsDemo,
  ModeSelectionDemo,
  MusicDemo,
  PhotoAlbumDemo,
  TriviaDemo,
  VolunteerHoursDemo,
} from '../components/LandingDemos';
import SiteLayout from '../components/SiteLayout';

// Line icons for the activity cards (24×24, drawn with `currentColor` so the
// badge's accent colour tints them). Decorative only: the card's heading
// already says what each one is.
const ACTIVITY_ICONS = {
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  conversation: <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />,
  trivia: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></>,
  photo: <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M4 15l4-4 4 4 3-3 5 5" /></>,
  games: <><rect x="2" y="8" width="20" height="8" rx="4" /><path d="M8 10v4M6 12h4M15 12h.01M17 11h.01" /></>,
  meditation: <path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7" />,
} as const;

// What the two people can do together. Each card's accent is an activity
// colour from the app's theme.
const ACTIVITIES = [
  {
    title: 'Music & video',
    body: 'Songs and videos they’re likely to know, chosen for them from a shared library.',
    accent: 'music',
    icon: 'music',
  },
  {
    title: 'Conversation',
    body: 'Starters written from their own life, for when you’re not sure what to say next.',
    accent: 'conversation',
    icon: 'conversation',
  },
  {
    title: 'Personal trivia',
    body: 'Questions about their hometown, work and interests, to enjoy together.',
    accent: 'trivia',
    icon: 'trivia',
  },
  {
    title: 'Photo albums',
    body: 'Family photos, ready to look through and talk about.',
    accent: 'photoAlbum',
    icon: 'photo',
  },
  {
    title: 'Gentle games',
    body: 'Big targets and warm encouragement, with no timers and no way to lose.',
    accent: 'games',
    icon: 'games',
  },
  {
    title: 'Guided meditation',
    body: 'A calm moment to share, whenever one is needed.',
    accent: 'meditation',
    icon: 'meditation',
  },
] as const;

// Steps of a one-on-one session, shown in the "How a session works" strip.
const STEPS = [
  ['Add their life story', 'Family and staff fill in a guided questionnaire: hometown, work, family and favourite songs.'],
  ['Sit down together', 'Open Welicare on the iPad, side by side. AI turns their story into activities made for them.'],
  ['Follow what they enjoy', 'Choose music, conversation, photos or a game, and go at their pace.'],
] as const;

// One tab per person who supports a session. Each panel is a drawn screen
// beside what that person gets (see RoleTabs and .role in styles.css). The
// resident's own side has its own section above, because they use the app
// with one of these people rather than as a separate audience.
const ROLES = [
  {
    id: 'caregivers',
    label: 'Caregivers',
    accent: 'conversation',
    title: 'Every session prepared before you sit down',
    summary: 'For recreation therapists and staff caregivers: everyone in your facility, and ideas made for each of them.',
    points: [
      'See and update the profiles of every resident in your facility',
      'AI activity ideas and conversation starters from each life story, plus suggestions of real songs and movies to add',
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
    // Purple rather than trivia's terracotta, which reads as the same brown
    // as Family members' photoAlbum accent.
    accent: 'meditation',
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

// The roles section as browser-style tabs: one line of roles, and the
// selected one's screen and writeup in a panel underneath. Showing one role
// at a time keeps the page short on phones. Follows the WAI-ARIA tabs
// pattern: arrow keys move between tabs, and only the selected tab is in the
// Tab order.
function RoleTabs() {
  const [active, setActive] = useState<RoleId>(() => roleFromHash() ?? 'caregivers');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The hero's mode links change the hash (#caregivers, ...). The tab buttons
  // carry those ids, so the browser scrolls to the tab row, and this
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
              // The selected word takes its role's accent colour (the app's
              // activity icon colour); its underline follows via currentColor.
              style={selected ? { color: `var(--act-${accent}-icon)` } : undefined}
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
            Welicare is an iPad app for a caregiver or family member to use with a person living
            with dementia. Sit down together, and it brings up music, photos, conversation and
            gentle games shaped by their life story.
          </p>
          <div className="hero-actions">
            <a className="button" href="#how">See how a session works</a>
            <Link className="button secondary" to="/contact">Pilot Welicare at your site</Link>
          </div>
        </div>
        {/* The screen that ties the roles together: its buttons link down
            to each one's section of the page. */}
        <DeviceFrame interactive caption="One app, with a mode for each person in the circle of care">
          <ModeSelectionDemo />
        </DeviceFrame>
      </section>

      <section id="how" className="section">
        <h2>How a session works</h2>
        <p className="section-dek">Three steps from their story to a shared moment.</p>
        <ol className="steps">
          {STEPS.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="activities" className="section">
        <h2>What you can do together</h2>
        <p className="section-dek">Activities shaped by the life of the person beside you.</p>
        <div className="feature-grid">
          {ACTIVITIES.map((a) => (
            <article key={a.title} className="feature">
              <span
                className="feature-badge"
                aria-hidden="true"
                style={{ background: `var(--act-${a.accent}-bg)`, color: `var(--act-${a.accent}-icon)` }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {ACTIVITY_ICONS[a.icon]}
                </svg>
              </span>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
        {/* The two demos sit right under the activities they show. */}
        <div className="showcase">
          <DeviceFrame caption="Trivia written from the resident’s own life">
            <TriviaDemo />
          </DeviceFrame>
          <DeviceFrame caption="Songs from their era, ready to play">
            <MusicDemo />
          </DeviceFrame>
        </div>
      </section>

      {/* Same screen-beside-description panel as the role tabs below. */}
      <section id="made-for-dementia" className="section">
        <h2>Made for people living with dementia</h2>
        <article className="role">
          <DeviceFrame caption="Every activity one big tap away">
            <ActivityMenuDemo />
          </DeviceFrame>
          <div className="role-copy">
            <h3>Calm, simple and easy to share</h3>
            <p className="role-summary">
              Big, colourful tiles keep the focus on the two of you, not on the iPad.
            </p>
            <ul className="role-points">
              <li>Games with no timers and no way to lose, just warm encouragement</li>
              <li>Atkinson Hyperlegible type made for low vision, and a high-contrast palette</li>
              <li>Labels on every control for VoiceOver and TalkBack</li>
              <li>A PIN lock that keeps staff and family screens out of the way during a session</li>
            </ul>
          </div>
        </article>
      </section>

      <section id="roles" className="section roles" aria-labelledby="roles-heading">
        <h2 id="roles-heading">Support for everyone in the circle of care</h2>
        <p className="section-dek">
          Caregivers, family, volunteers and administrators each get their own view.
        </p>
        <RoleTabs />
      </section>

      {/* Two paths, so family visitors get a next step as well as care homes. */}
      <section className="section cta">
        <h2>Interested in Welicare?</h2>
        <p>We’re looking for care homes to pilot the app, and we’d love to hear from families too.</p>
        <div className="cta-actions">
          <Link className="button" to="/contact">Pilot Welicare at your site</Link>
          <Link className="button" to="/contact">I’m a family member</Link>
        </div>
      </section>
    </SiteLayout>
  );
}
