// Shell for the Administrator area: a header with navigation and sign-out,
// and the current admin page below it. More links are added as the
// dashboard, users, organization and residents screens are built.
import { signOut } from 'firebase/auth';
import { NavLink, Outlet } from 'react-router';
import { auth } from '../firebase';

export default function AdminLayout() {
  return (
    <>
      <header className="app-header">
        <span className="brand">Welicare</span>
        <nav aria-label="Administrator">
          <NavLink to="/admin/approvals">Approvals</NavLink>
        </nav>
        <button type="button" className="secondary" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
    </>
  );
}
