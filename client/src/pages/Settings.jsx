import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Shown identically on both the Admin and Developer views (US-16): the
// logged-in user's own name and role, nothing else - no settings storage
// exists anywhere in the backend yet, so nothing here is invented.
function AccountDetails({ user }) {
  const roleLabel =
    user?.role === 'admin' ? 'Admin' : user?.role === 'developer' ? 'Developer' : user?.role ?? 'Unknown';

  return (
    <section className="settings-page__account">
      <h2>Your account</h2>
      <dl className="settings-page__details">
        <div className="settings-page__detail-row">
          <dt>Name</dt>
          <dd>{user?.name ?? 'Unknown'}</dd>
        </div>
        <div className="settings-page__detail-row">
          <dt>Role</dt>
          <dd>{roleLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

// US-16, T16.2. A Developer gets their own account view here - same shared
// route as the Admin's System Settings page (T16.1's decision), but no
// AdminSidebar and no org-level content, just their own name/role. This is
// the account view only: the route is still admin-only gated in App.jsx and
// there is still no nav link to it for a Developer - that's T16.3/T16.4,
// not this subtask. The topbar below matches MyProjects.jsx/
// DeveloperDashboard.jsx exactly (same classes/markup), so this page reads
// as part of the same set of Developer pages rather than a one-off.
function DeveloperAccountView({ user, onSignOut }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userName = user?.name || 'Pang';
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Developer';

  return (
    <div className="my-projects-page dev-dashboard">
      <header className="developer-dashboard__header dev-topbar">
        <div className="dev-topbar__left">
          <Link to="/dashboard" className="dev-topbar__logo">
            BIX
          </Link>

          <nav className="dev-topbar__nav">
            <Link to="/dashboard" className="dev-nav-link">
              <svg
                className="dev-nav-icon"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="#222220" strokeWidth="1.8" />
                <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="#222220" strokeWidth="1.8" />
                <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="#222220" strokeWidth="1.8" />
                <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="#222220" strokeWidth="1.8" />
              </svg>
              <span>DashBoard</span>
            </Link>

            <Link to="/projects" className="dev-nav-link">
              <svg
                className="dev-nav-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#222220"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>My Project</span>
            </Link>
          </nav>
        </div>

        <div className="dev-topbar__right">
          <div
            className="dev-user-profile"
            onClick={() => setShowUserMenu((prev) => !prev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setShowUserMenu((prev) => !prev);
              }
            }}
          >
            <div className="dev-user-profile__info">
              <span className="dev-user-profile__name">{userName}</span>
              <span className="dev-user-profile__role">{userRole}</span>
            </div>

            <div className="dev-user-profile__avatar">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#222220"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            <span className="dev-user-profile__caret">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#222220"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>

            {showUserMenu && (
              <div className="dev-user-dropdown">
                <Link to="/settings" className="dev-user-dropdown__item dev-user-dropdown__item--settings">
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="dev-user-dropdown__item dev-user-dropdown__item--signout"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="my-projects-main dev-main">
        <h1 className="my-projects-title">Account Settings</h1>
        <AccountDetails user={user} />
        <p className="settings-page__note">More settings are coming soon.</p>
      </main>
    </div>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  if (user?.role !== 'admin') {
    return <DeveloperAccountView user={user} onSignOut={handleSignOut} />;
  }

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        <div className="admin-dashboard__header">
          <h1>System Settings</h1>
        </div>

        <AccountDetails user={user} />

        <p className="settings-page__note">
          More settings are coming soon.
        </p>
      </main>
    </div>
  );
}
