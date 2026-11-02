// Shared frame for the public pages (Home, Our Story and Contact): logo,
// page nav and footer. There's no Sign in button for now: the site's job is
// showing what Welicare does and collecting pilot interest. The portal
// routes (/login, /admin, …) still exist in App.tsx, just unlinked. The nav
// links are real routes now, so this header is the only way between pages
// and has to stay visible on every screen size (see styles.css).
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

// Used when a page doesn't pass its own title or description (Home).
const DEFAULT_TITLE = 'Welicare · One-on-one sessions for people living with dementia';
const DEFAULT_DESCRIPTION =
  'Welicare is an iPad app for a caregiver or family member to use one-on-one with a person living with dementia, with music, photos, conversation and gentle games shaped by their life story.';

// `title` names the page in the browser tab, and it's the first thing a
// screen reader announces after navigating. `description` is the page's
// summary in search results and link previews. React 19 moves <title> and
// <meta> into <head> wherever they're rendered, so each page gets its own.
export default function SiteLayout({
  title,
  description = DEFAULT_DESCRIPTION,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      <title>{title ? `${title} · Welicare` : DEFAULT_TITLE}</title>
      <meta name="description" content={description} />
      <header className="site-header">
        {/* The alt text is the link's name, so it says where the link goes.
            width + height (the file is 773×248) reserve the space before the
            image loads, so the header doesn't jump. */}
        <Link to="/"><img src="/welicare-logo.png" alt="Welicare home" width={125} height={40} /></Link>
        {/* NavLink sets aria-current="page" on the active link, which the
            stylesheet uses for the selected look. `end` keeps "Overview"
            from matching every path under "/" (so "Home" isn't always selected). */}
        <nav aria-label="Site">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/our-story">Our Story</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </nav>
      </header>

      {/* id="main" is the skip link's target. */}
      <main id="main">{children}</main>

      <footer className="site-footer">
        {/* A second way between pages for people who've scrolled to the end. */}
        <nav aria-label="Footer">
          <Link to="/">Home</Link>
          <Link to="/our-story">Our Story</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <p>Welicare · Made for dementia care teams and families. Not yet on the App Store.</p>
        {/* Same notice as the README and LICENSE. The year is read at render
            time so it never goes stale. */}
        <p>Copyright © {new Date().getFullYear()} Natasha Mykytiuk. All rights reserved.</p>
      </footer>
    </>
  );
}
