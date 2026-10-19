// Shared frame for the public pages (Overview, Our Story and Contact): logo, page
// nav, the Sign in / "Open your dashboard" button, and the footer. The nav
// links are real routes now, so this header is the only way between pages
// and has to stay visible on every screen size (see styles.css).
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { homePathFor } from '../auth/routing';

// The portal button used in the header. Pages that need the same button in
// their own content (the Overview's CTA) build it with this too.
export function usePortalLink() {
  const { loading, user, profile } = useAuth();
  // While auth is still loading, show "Sign in": it's right for most
  // visitors, and the login page forwards a signed-in person anyway.
  const signedIn = !loading && !!user;
  const portalLink = signedIn ? (
    <Link className="button" to={homePathFor(profile)}>Open your dashboard</Link>
  ) : (
    <Link className="button" to="/login">Sign in</Link>
  );
  return { signedIn, portalLink };
}

// `title` names the page in the browser tab, and it's the first thing a
// screen reader announces after navigating. React 19 moves <title> into
// <head> wherever it's rendered.
export default function SiteLayout({ title, children }: { title?: string; children: ReactNode }) {
  const { portalLink } = usePortalLink();
  return (
    <>
      <title>{title ? `${title} · Welicare` : 'Welicare'}</title>
      <header className="site-header">
        {/* The alt text is the link's name, so it says where the link goes. */}
        <Link to="/"><img src="/welicare-logo.png" alt="Welicare home" height={40} /></Link>
        {/* NavLink sets aria-current="page" on the active link, which the
            stylesheet uses for the selected look. `end` keeps "Overview"
            from matching every path under "/". */}
        <nav aria-label="Site">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/our-story">Our Story</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </nav>
        {portalLink}
      </header>

      {/* id="main" is the skip link's target. */}
      <main id="main">{children}</main>

      <footer className="site-footer">
        <p>Welicare · Made for dementia care teams and families. Not yet on the App Store.</p>
        {/* Same notice as the README and LICENSE. */}
        <p>Copyright © 2026 Natasha Mykytiuk. All rights reserved.</p>
      </footer>
    </>
  );
}
