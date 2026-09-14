import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const allProjects = [
  {
    id: 1,
    name: 'Project Alpha',
    description: 'Internal task management platform for dev teams.',
    status: 'Active',
    statusType: 'active',
    assigned: true,
    currentSprint: 'Sprint 4',
    sprintEnds: 'Fri, Sep 19',
    scrumMaster: '@abc.tan',
    progress: 60,
    devCount: 3,
    avatars: [
      { text: 'A', bg: '#40c4ff' },
      { text: 'N', bg: '#4ade80' },
      { text: 'L', bg: '#f87171' }
    ]
  },
  {
    id: 2,
    name: 'Project Beta',
    description: 'Internal task management platform for dev teams.',
    status: 'Planning',
    statusType: 'planning',
    assigned: true,
    currentSprint: 'Sprint 1',
    sprintEnds: 'Mon, Sep 13',
    scrumMaster: '@abc.pang',
    progress: 20,
    devCount: 3,
    avatars: [
      { text: 'T', bg: '#40c4ff' },
      { text: 'N', bg: '#4ade80' },
      { text: 'P', bg: '#f87171' }
    ]
  },
  {
    id: 3,
    name: 'Project Gamma',
    description: 'Internal task management platform for dev teams.',
    status: 'Not started',
    statusType: 'not-started',
    // Not assigned to the current developer (US-05). Still shown on page 1,
    // but locked: no project detail, no board access - just enough to
    // illustrate the access rule. A real API response might instead omit it
    // entirely; kept visible here since that's what was asked for.
    assigned: false,
    currentSprint: '-',
    sprintEnds: '-',
    scrumMaster: '@abc.eng',
    progress: 0,
    devCount: 3,
    avatars: [
      { text: 'T', bg: '#40c4ff' },
      { text: 'N', bg: '#4ade80' },
      { text: 'P', bg: '#f87171' }
    ]
  }
];

const filterTabs = ['All', 'Active', 'Planning', 'Not started'];

export default function MyProjects() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  // The locked project the "No access" modal is currently explaining, or
  // null when the modal is closed.
  const [accessDeniedProject, setAccessDeniedProject] = useState(null);

  const userName = user?.name || 'Pang';
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Developer';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredProjects = useMemo(() => {
    return allProjects.filter((project) => {
      const matchesFilter =
        selectedFilter === 'All' || project.status === selectedFilter;
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.scrumMaster.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [selectedFilter, searchQuery]);

  // Changing the filter or search should always land back on page 1.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, searchQuery]);

  // The full assigned-project list fits on one page; page 2 is a fixed,
  // empty placeholder until this page is backed by real, paged data.
  const totalPages = 2;

  const goToNextPage = () => setCurrentPage((page) => Math.min(totalPages, page + 1));
  const goToPreviousPage = () => setCurrentPage((page) => Math.max(1, page - 1));

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
                <button
                  type="button"
                  onClick={handleLogout}
                  className="dev-user-dropdown__item"
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
          {currentPage === 1 ? (
            filteredProjects.map((project) =>
              project.assigned === false ? (
                // US-05: a project the current developer isn't assigned to.
                // Shown locked, with no project detail or board access.
                <article
                  className="project-card-row project-card-row--locked"
                  key={project.id}
                >
                  <div className="project-card-left">
                    <div className="project-card-name-row">
                      <h2 className="project-card-name">{project.name}</h2>
                      <span className="dev-status-pill dev-status-pill--locked">
                        <span className="dev-status-dot" />
                        Not assigned
                      </span>
                    </div>

                    <p className="project-card-desc project-card-desc--locked">
                      You&apos;re not assigned to this project, so it won&apos;t
                      appear on your dashboard. Shown here only to illustrate
                      the access rule.
                    </p>
                  </div>

                  <div className="project-card-right project-card-right--locked">
                    <button
                      type="button"
                      className="project-no-access-btn"
                      onClick={() => setAccessDeniedProject(project)}
                    >
                      No access
                    </button>
                  </div>
                </article>
              ) : (
              <article className="project-card-row" key={project.id}>
                {/* Left Details */}
                <div className="project-card-left">
                  <div className="project-card-name-row">
                    <h2 className="project-card-name">{project.name}</h2>
                    <span
                      className={`dev-status-pill dev-status-pill--${project.statusType}`}
                    >
                      <span className="dev-status-dot" />
                      {project.status}
                    </span>
                  </div>

                  <p className="project-card-desc">{project.description}</p>

                  <div className="project-card-meta">
                    <div className="project-meta-col">
                      <span className="project-meta-label">Current sprint</span>
                      <span className="project-meta-val">{project.currentSprint}</span>
                    </div>

                    <div className="project-meta-col">
                      <span className="project-meta-label">Sprint ends</span>
                      <span className="project-meta-val">{project.sprintEnds}</span>
                    </div>

                    <div className="project-meta-col">
                      <span className="project-meta-label">Scrum master</span>
                      <span className="project-meta-val">{project.scrumMaster}</span>
                    </div>
                  </div>

                  <div className="project-card-team">
                    <div className="project-team-avatars">
                      {project.avatars.map((av, idx) => (
                        <span
                          key={idx}
                          className="project-team-avatar"
                          style={{ backgroundColor: av.bg }}
                        >
                          {av.text}
                        </span>
                      ))}
                    </div>
                    <span className="project-team-count">
                      {project.devCount} developers working on this project
                    </span>
                  </div>
                </div>

                {/* Right Details */}
                <div className="project-card-right">
                  <div className="project-card-progress">
                    <div className="project-progress-track">
                      <div
                        className="project-progress-fill"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="project-progress-label">{project.progress}%</span>
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
              )
            )
          ) : (
            <p className="my-projects-empty">No projects to show on this page.</p>
          )}
        </section>

        {/* Pagination Footer */}
        <footer className="my-projects-pagination">
          <span className="pagination-count">
            {currentPage}/{totalPages} pages
          </span>

          {totalPages > 1 &&
            (currentPage < totalPages ? (
              <button
                type="button"
                className="pagination-nav-btn"
                onClick={goToNextPage}
              >
                <span>Next page</span>
                <span aria-hidden="true">⇨</span>
              </button>
            ) : (
              <button
                type="button"
                className="pagination-nav-btn"
                onClick={goToPreviousPage}
              >
                <span aria-hidden="true">⇦</span>
                <span>Previous page</span>
              </button>
            ))}
        </footer>
      </main>

      {accessDeniedProject && (
        <div
          className="access-denied-overlay"
          onClick={() => setAccessDeniedProject(null)}
        >
          <div
            className="access-denied-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="access-denied-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="access-denied-close"
              aria-label="Close"
              onClick={() => setAccessDeniedProject(null)}
            >
              ×
            </button>

            <div className="access-denied-icon" aria-hidden="true">
              ⊘
            </div>

            <h2 id="access-denied-title" className="access-denied-title">
              You don&apos;t have access to this project
            </h2>

            <p className="access-denied-desc">
              You&apos;re not currently assigned to {accessDeniedProject.name}
              . If you think this is a mistake, ask your project admin to add
              you to the team.
            </p>

            <button
              type="button"
              className="access-denied-back"
              onClick={() => setAccessDeniedProject(null)}
            >
              Back to my projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
