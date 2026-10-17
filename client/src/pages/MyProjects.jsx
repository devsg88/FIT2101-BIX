import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';

// Matches DeveloperDashboard.jsx's own mapping - the backend's raw status
// values ('active' | 'planning' | 'not-started', see
// getProjectSummariesForUser in projectMembershipModel.js) doubling as both
// the CSS modifier and the lookup key here, so the two pages can never
// disagree on what a given status looks like.
const STATUS_LABELS = {
  active: 'Active',
  planning: 'Planning',
  'not-started': 'Not started'
};

const filterTabs = ['All', 'Active', 'Planning', 'Not started'];

export default function MyProjects() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');

  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  // Same endpoint DeveloperDashboard.jsx already uses - this page only
  // reads data.data.projects out of it. Also used as the Retry action.
  const loadProjects = useCallback(() => {
    setStatus('loading');
    getDashboard(user.token)
      .then((data) => {
        setProjects(Array.isArray(data?.data?.projects) ? data.data.projects : []);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [user.token]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const userName = user?.name || 'Pang';
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Developer';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const label = STATUS_LABELS[project.status] ?? project.status;
      const matchesFilter = selectedFilter === 'All' || label === selectedFilter;
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [projects, selectedFilter, searchQuery]);

  return (
    <div className="my-projects-page dev-dashboard">
      {/* Top Navigation Bar */}
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

            <Link to="/projects" className="dev-nav-link dev-nav-link--active">
              <svg
                className="dev-nav-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#38b6ff"
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
      <main className="my-projects-main dev-main">
        {/* Title and Search Header */}
        <section className="my-projects-header">
          <div className="my-projects-title-row">
            <div className="my-projects-title-group">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1d1d1b"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="9" y1="13" x2="9" y2="17" />
                <line x1="13" y1="13" x2="13" y2="17" />
              </svg>
              <h1 className="my-projects-title">My Projects</h1>
            </div>

            <div className="my-projects-search">
              <input
                type="text"
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search projects"
              />
              <svg
                className="my-projects-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>

          <p className="my-projects-sub">
            Project assigned to you. Only projects you're a memebr of appear here.
          </p>

          {/* Filter Pills */}
          <div className="my-projects-filters">
            {filterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`my-projects-filter-btn ${
                  selectedFilter === tab ? 'my-projects-filter-btn--active' : ''
                }`}
                onClick={() => setSelectedFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </section>

        {/* Project Cards List */}
        <section className="my-projects-list">
          {status === 'loading' && (
            <p className="dashboard-status">Loading your projects...</p>
          )}

          {status === 'error' && (
            <div className="dashboard-status" role="alert">
              <p>Couldn&apos;t load your projects.</p>
              <button type="button" onClick={loadProjects}>
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && filteredProjects.length === 0 && (
            <p className="my-projects-empty">No projects to show.</p>
          )}

          {status === 'ready' &&
            filteredProjects.map((project) => {
              const statusLabel = STATUS_LABELS[project.status] ?? project.status;

              return (
                <article className="project-card-row" key={project.id}>
                  {/* Left Details */}
                  <div className="project-card-left">
                    <div className="project-card-name-row">
                      <h2 className="project-card-name">{project.name}</h2>
                      <span
                        className={`dev-status-pill dev-status-pill--${project.status}`}
                      >
                        <span className="dev-status-dot" />
                        {statusLabel}
                      </span>
                    </div>

                    <p className="project-card-desc">No description available yet.</p>

                    {/* Sprint/Scrum Master/team details are not provided by
                        the backend yet (see US-09, Tag Scrum Master &
                        Product Owner, still in progress) - shown as
                        honestly unavailable rather than invented, same
                        layout kept for when that data exists. */}
                    <div className="project-card-meta">
                      <div className="project-meta-col">
                        <span className="project-meta-label">Current sprint</span>
                        <span className="project-meta-val">Not available yet</span>
                      </div>

                      <div className="project-meta-col">
                        <span className="project-meta-label">Sprint ends</span>
                        <span className="project-meta-val">Not available yet</span>
                      </div>

                      <div className="project-meta-col">
                        <span className="project-meta-label">Scrum master</span>
                        <span className="project-meta-val">Not available yet</span>
                      </div>
                    </div>

                    <div className="project-card-team">
                      <span className="project-team-count">
                        Team info not available yet
                      </span>
                    </div>
                  </div>

                  {/* Right Details */}
                  <div className="project-card-right">
                    <div className="project-card-progress">
                      {project.progress === null ? (
                        <span className="project-progress-label">No tasks yet</span>
                      ) : (
                        <>
                          <div className="project-progress-track">
                            <div
                              className="project-progress-fill"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <span className="project-progress-label">{project.progress}%</span>
                        </>
                      )}
                    </div>

                    <Link
                      to={`/projects/${project.id}/board`}
                      className="project-open-board-btn"
                    >
                      <span>Open Board</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                      </svg>
                    </Link>
                  </div>
                </article>
              );
            })}
        </section>
      </main>
    </div>
  );
}
