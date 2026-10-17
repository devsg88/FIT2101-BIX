import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const STATUS_LABELS = {
  active: 'Active',
  planning: 'Planning',
  'not-started': 'Not started'
};

// Coarse relative time for Task History ("4h ago", "2d ago"). Completed
// dates here are always in the past and within the last 7 days (the
// controller already filters to that window), so this never needs to
// handle future dates or longer ranges.
function formatRelativeTime(isoString) {
  const completedMs = new Date(isoString).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - completedMs) / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function DeveloperDashboard({ data }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // status/progress are derived server-side from sprints and tasks (see
  // getProjectSummariesForUser in projectMembershipModel.js) - progress is
  // null, not 0, when a project has no tasks at all, so an empty project is
  // never shown as "0% done".
  const projects = data?.data?.projects ?? [];
  const projectCount = data?.data?.projectCount ?? projects.length;
  const myTasksCount = data?.data?.myTasksCount ?? 0;
  const overallProgressPercent = data?.data?.overallProgressPercent ?? null;
  const taskHistory = data?.data?.taskHistory ?? [];

  const userName = user?.name || 'Pang';
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Developer';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="developer-dashboard dev-dashboard">
      {/* Top Navigation Bar */}
      <header className="developer-dashboard__header dev-topbar">
        <div className="dev-topbar__left">
          <Link to="/dashboard" className="dev-topbar__logo">
            BIX
          </Link>

          <nav className="dev-topbar__nav">
            <Link to="/dashboard" className="dev-nav-link dev-nav-link--active">
              <svg
                className="dev-nav-icon"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="#38b6ff" strokeWidth="1.8" />
                <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="#38b6ff" strokeWidth="1.8" />
                <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="#38b6ff" strokeWidth="1.8" />
                <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="#38b6ff" strokeWidth="1.8" />
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
                stroke="currentColor"
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
          <button type="button" className="dev-topbar__bell" aria-label="Notifications">
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>

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
                  onClick={handleLogout}
                  className="dev-user-dropdown__item dev-user-dropdown__item--signout"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="dev-main">
        {/* Greeting Banner */}
        <section className="dev-greeting">
          <p className="dev-greeting__sub">Good morning,</p>
          <h1 className="dev-greeting__title">
            {userName} <span className="dev-greeting__wave" role="img" aria-label="wave">👋</span>
          </h1>
          <p className="dev-greeting__desc">
            Here's an overview of your projects and current work.
          </p>
        </section>

        {/* 3 Stat Cards */}
        <section className="dev-stats stat-cards">
          {/* Stat 1: My Projects */}
          <Link to="/projects" className="dev-stat-card dev-stat-card--link stat-card">
            <div className="dev-stat-card__icon dev-stat-card__icon--blue">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="dev-stat-card__title stat-card__label">My Projects</h3>
            <div className="dev-stat-card__value stat-card__value">{projectCount}</div>
            <p className="dev-stat-card__sub">Assigned projects</p>
          </Link>

          {/* Stat 2: My Tasks - open (not-done) tasks assigned to you */}
          <div className="dev-stat-card stat-card">
            <div className="dev-stat-card__icon dev-stat-card__icon--green">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="dev-stat-card__title stat-card__label">My Tasks</h3>
            <div className="dev-stat-card__value stat-card__value">{myTasksCount}</div>
            <p className="dev-stat-card__sub">Open tasks assigned to you</p>
          </div>

          {/* Stat 3: Overall Progress - tasks done vs total, across your projects */}
          <div className="dev-stat-card stat-card">
            <div className="dev-stat-card__icon dev-stat-card__icon--orange">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3 className="dev-stat-card__title stat-card__label">Overall Progess</h3>
            <div className="dev-stat-card__value stat-card__value">
              {overallProgressPercent === null ? 'N/A' : `${overallProgressPercent}%`}
            </div>
            <p className="dev-stat-card__sub">
              {overallProgressPercent === null ? 'No tasks yet' : 'Tasks done vs total, across your projects'}
            </p>
          </div>
        </section>

        {/* Lower Grid: My Projects (left) & Task History (right) */}
        <div className="dev-grid">
          {/* Left: My Projects Card */}
          <section className="developer-dashboard__board dev-card dev-projects-card">
            <div className="dev-card__header">
              <div className="dev-card__title-group">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1d1d1b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="9" y1="13" x2="9" y2="17" />
                  <line x1="13" y1="13" x2="13" y2="17" />
                </svg>
                <h2>My Projects</h2>
              </div>

              <Link to="/projects" className="dev-view-all">
                View all Projects →
              </Link>
            </div>

            <div className="dev-projects-table">
              <div className="dev-table-header">
                <span className="dev-th dev-th--project">Project</span>
                <span className="dev-th dev-th--status">Status</span>
                <span className="dev-th dev-th--progress">Progress</span>
                <span className="dev-th dev-th--action" />
              </div>

              <div className="dev-table-body">
                {projects.length === 0 && (
                  <p className="dev-history-footer">No projects assigned yet.</p>
                )}

                {projects.map((proj) => (
                  <div className="dev-table-row" key={proj.id}>
                    <div className="dev-cell dev-cell--project">
                      <strong className="dev-project-name">{proj.name}</strong>
                    </div>

                    <div className="dev-cell dev-cell--status">
                      <span className={`dev-status-pill dev-status-pill--${proj.status}`}>
                        <span className="dev-status-dot" />
                        {STATUS_LABELS[proj.status] ?? proj.status}
                      </span>
                    </div>

                    <div className="dev-cell dev-cell--progress">
                      {proj.progress === null ? (
                        <span className="dev-progress-percent">No tasks yet</span>
                      ) : (
                        <>
                          <span className="dev-progress-percent">{proj.progress}%</span>
                          <div className="dev-progress-track">
                            <div
                              className="dev-progress-fill"
                              style={{ width: `${proj.progress}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="dev-cell dev-cell--action">
                      <Link to={`/projects/${proj.id}/board`} className="dev-open-board">
                        Open Board →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right: Task History Card - tasks you completed in the last 7 days */}
          <aside className="developer-dashboard__sidebar dev-card dev-history-card task-history">
            <div className="dev-card__header">
              <div className="dev-card__title-group">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1d1d1b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <polyline points="12 7 12 12 15 15" />
                </svg>
                <h2>Task History</h2>
              </div>
            </div>

            {taskHistory.length === 0 ? (
              <p className="dev-history-footer">
                No tasks completed in the last 7 days.
              </p>
            ) : (
              <>
                <div className="dev-task-history-list">
                  {taskHistory.map((task) => (
                    <div className="dev-task-item" key={task.id}>
                      <strong className="dev-task-title">{task.title}</strong>
                      <p className="dev-task-project">{task.projectName}</p>
                      <p className="dev-task-time">
                        Completed - {formatRelativeTime(task.completedAt)}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="dev-history-footer">
                  That's everything from the last 7 days
                </p>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}