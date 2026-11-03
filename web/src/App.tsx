// Routes. For now the site is only the public pages (Overview, Our Story,
// Contact): its job is showing what Welicare does and collecting pilot
// interest. Any other address, including the old portal URLs (/login,
// /admin, …), shows the "page not found" page.
//
// The sign-in portal's screens (src/auth, src/admin, LoginPage,
// ResetPasswordPage, InfoPage) are kept and still type-checked, linted and tested,
// but aren't routed. Their routes used to sit here commented out; to bring
// the portal back, register them here again inside an <AuthProvider>
// (git history has the previous wiring).
import { BrowserRouter, Route, Routes } from 'react-router';
import ContactPage from './pages/ContactPage';
import LandingPage from './pages/LandingPage';
import NotFoundPage from './pages/NotFoundPage';
import OurStoryPage from './pages/OurStoryPage';

export default function App() {
  // No AuthProvider: the public pages don't need it, and leaving it out
  // means visitors don't wait on the auth check's splash screen.
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/our-story" element={<OurStoryPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {/* Unknown addresses get a "page not found" page rather than a silent
            redirect, so a broken link is visible as one. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
