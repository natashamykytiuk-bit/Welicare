// The Home page's "screenshots", drawn in HTML/CSS rather than images so they
// stay crisp, use the shared theme colours and never go stale with a real
// resident's photo or name in them. Margaret and the other names are made up.
import type { ReactNode } from 'react';

// An iPad-shaped frame for the drawn screens. Hidden from screen readers:
// the caption under each one says what it shows. `interactive` frames hold
// real links (the hero's mode buttons), so they stay visible to assistive
// tech: focusable links inside aria-hidden would be unreachable by name.
export function DeviceFrame({ children, caption, interactive = false }: { children: ReactNode; caption: string; interactive?: boolean }) {
  return (
    <figure className="device">
      <div className="device-bezel" aria-hidden={interactive ? undefined : true}>
        <div className="device-screen">{children}</div>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// The app's activity menu: big, colourful tiles.
// Styled to match the app's ActivityMenuScreen: two columns of pastel tiles
// (the activity's `bg` colour) with an outline icon and label in the main
// text colour, not the activity's accent.
export function ActivityMenuDemo() {
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

// A trivia question generated from the resident's profile.
export function TriviaDemo() {
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
export function MusicDemo() {
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

// The Mode Selection screen everyone lands on after signing in, styled after
// ModeSelectionScreen: a big Resident Mode card, then the staff and family
// modes, each behind a PIN. Each mode links down the Home page: to its role
// tab (ROLES ids), or for Resident Mode to the made-for-dementia section.
export function ModeSelectionDemo() {
  const modes = [
    ['Family Mode', '#family'],
    ['Caregiver Mode', '#caregivers'],
    ['Volunteer Mode', '#volunteers'],
    ['Admin Mode', '#administrators'],
  ];
  return (
    <div className="demo">
      <p className="demo-title">How are you using Welicare today?</p>
      <a className="demo-resident-card" href="#made-for-dementia">
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

// A caregiver's AI conversation starters, written from the resident's life
// story. Follows the Alzheimer Society of B.C.'s conversation guidance: open
// the door with a detail or something of your own, and ask about feelings and
// favourites rather than testing recall, so there's no wrong answer.
export function ConversationDemo() {
  const starters = [
    'I hear you grew up on a farm. What did you like best about it?',
    'My grandmother loved Patsy Cline too. What music makes you happy?',
    'What are you most proud of from your farming years?',
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
export function PhotoAlbumDemo() {
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
// invite code, waiting for approval.
export function JoinRequestsDemo() {
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
export function VolunteerHoursDemo() {
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
