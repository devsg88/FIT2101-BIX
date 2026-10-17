import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Reached from AdminSidebar's "System Settings" button, which previously had
// no onClick at all - clicking it did nothing. This is deliberately minimal:
// there is no settings storage anywhere in the backend yet (no user
// preferences, no org config), so this only shows what's actually true
// today (the logged-in Admin's own name and role, from AuthContext) rather
// than inventing toggles or fields with nothing behind them.
export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        <div className="admin-dashboard__header">
          <h1>System Settings</h1>
        </div>

        <section className="settings-page__account">
          <h2>Your account</h2>
          <dl className="settings-page__details">
            <div className="settings-page__detail-row">
              <dt>Name</dt>
              <dd>{user?.name ?? 'Unknown'}</dd>
            </div>
            <div className="settings-page__detail-row">
              <dt>Role</dt>
              <dd>{user?.role === 'admin' ? 'Admin' : user?.role ?? 'Unknown'}</dd>
            </div>
          </dl>
        </section>

        <p className="settings-page__note">
          More settings are coming soon.
        </p>
      </main>
    </div>
  );
}
