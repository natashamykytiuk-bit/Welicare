// Shown while we find out who's signed in — the web version of the app's
// splash (expo-splash-screen in app.json): the logo, 280px wide, on the
// background colour. The logo is a copy of assets/welicare-logo.png in
// web/public, since the portal doesn't import app files.
export default function Splash() {
  return (
    <div className="splash" role="status">
      <img src="/welicare-logo.png" alt="Welicare" width={280} />
      <span className="visually-hidden">Loading…</span>
    </div>
  );
}
