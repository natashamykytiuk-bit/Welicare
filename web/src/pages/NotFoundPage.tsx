// Shown for any address that isn't one of the site's pages (the "*" route in
// App.tsx), in the same frame as every other page, with ways back. Firebase
// Hosting sends every path to index.html (firebase.json), so the HTTP status
// is still 200 — this page is for people, not crawlers.
import { Link } from 'react-router';
import SiteLayout from '../components/SiteLayout';

export default function NotFoundPage() {
  return (
    <SiteLayout title="Page not found" description="This page doesn’t exist on the Welicare website.">
      {/* Same layout as the Contact page: a heading over one text column. */}
      <article className="section story">
        <div className="hero story-hero">
          <h1>We couldn’t find that page</h1>
        </div>
        <p className="lead">
          The link may be out of date, or the address may have a typo. Here are some places to go
          instead.
        </p>
        <div className="hero-actions">
          <Link className="button" to="/">Go to the overview</Link>
          <Link className="button secondary" to="/contact">Contact us</Link>
        </div>
      </article>
    </SiteLayout>
  );
}
