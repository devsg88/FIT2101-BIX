import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getResponsibleProjects, getTeams } from '../../services/api.js';

// The left-hand nav shown on every admin page (Organization Overview and each
// team's page): brand, team search, a link back to the org overview, the team
// list (each one a real link, not just a label), and settings at the bottom.
//
// Which team is highlighted follows the URL, not its own local state: on a
// team's page (/teams/:teamId) that team is highlighted; anywhere else (the
// org overview) the first team is shown highlighted, matching the Figma
// default. This way the sidebar can be dropped into either page and always
// agree with what's actually on screen.
//
// The team list is real data from GET /api/teams, same as "Your projects"
// (US-04c) below it.
export default function AdminSidebar() {
  const { teamId } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const token = user?.token;

  const [projects, setProjects] = useState([]);
  const [projectsStatus, setProjectsStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error' | 'forbidden'
  // NFR-03: bumped by Retry to run the load again.
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [teams, setTeams] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error' | 'forbidden'
  const [teamsLoadAttempt, setTeamsLoadAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let isMounted = true;
    setProjectsStatus('loading');

    getResponsibleProjects(token)
      .then((data) => {
        if (!isMounted) return;
        setProjects(Array.isArray(data?.projects) ? data.projects : []);
        setProjectsStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) return;
        setProjects([]);
        // A 403 is an access decision, not a passing failure: no Retry.
        setProjectsStatus(err?.status === 403 ? 'forbidden' : 'error');
      });

    return () => {
      isMounted = false;
    };
  }, [token, loadAttempt]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let isMounted = true;
    setTeamsStatus('loading');

    getTeams(token)
      .then((data) => {
        if (!isMounted) return;
        setTeams(Array.isArray(data?.teams) ? data.teams : []);
        setTeamsStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) return;
        setTeams([]);
        setTeamsStatus(err?.status === 403 ? 'forbidden' : 'error');
      });

    return () => {
      isMounted = false;
    };
  }, [token, teamsLoadAttempt]);

  const activeTeamId = teamId ? Number(teamId) : teams[0]?.id;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  const visibleTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return teams;
    }
    return teams.filter((team) => team.name.toLowerCase().includes(query));
  }, [searchQuery, teams]);

  return (
    <aside className="admin-dashboard__sidebar">
      <Link to="/dashboard" className="admin-sidebar__logo">
        BIX <span aria-hidden="true">⌂</span>
      </Link>

      <div className="admin-sidebar__search">
        <span className="admin-sidebar__search-icon" aria-hidden="true">⌕</span>
        <input
          type="text"
          placeholder="Search teams..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search teams"
        />
      </div>

      <p className="admin-sidebar__label">Global overview</p>
      <Link to="/dashboard" className="admin-sidebar__org-link">
        Organization Dashboard
      </Link>
      <NavLink to="/analytics/sprints" className={({ isActive }) =>
        isActive ? 'admin-sidebar__org-link' : 'admin-sidebar__analytics-link'}>
        Sprint analytics
      </NavLink>
      <NavLink to="/analytics/projects" className={({ isActive }) =>
        isActive ? 'admin-sidebar__org-link' : 'admin-sidebar__analytics-link'}>
        Project analytics
      </NavLink>

      <p className="admin-sidebar__label">Active teams ({teams.length})</p>
      {teamsStatus === 'loading' && (
        <p className="admin-sidebar__label" role="status">Loading teams...</p>
      )}
      {teamsStatus === 'error' && (
        <div className="admin-sidebar__label" role="alert">
          <p>Couldn&apos;t load teams.</p>
          <button type="button" onClick={() => setTeamsLoadAttempt((attempt) => attempt + 1)}>
            Retry
          </button>
        </div>
      )}
      {teamsStatus === 'forbidden' && (
        <p className="admin-sidebar__label" role="alert">You don&apos;t have access to the team list.</p>
      )}
      {teamsStatus === 'ready' && teams.length === 0 && (
        <p className="admin-sidebar__label">No teams yet.</p>
      )}
      {teamsStatus === 'ready' && teams.length > 0 && (
        <div className="admin-sidebar__team-list">
          {/*loop that creates the clickable buttons for each team*/}
          {visibleTeams.map((team) => (
            <Link
              to={`/teams/${team.id}`}
              key={team.id}
              className={`admin-sidebar__team-btn ${
                activeTeamId === team.id ? 'admin-sidebar__team-btn--active' : ''
              }`}
            >
              {team.name}
            </Link>
          ))}
        </div>
      )}

      <p className="admin-sidebar__label" id="admin-sidebar-projects-label">Your projects</p>
      {projectsStatus === 'loading' && (
        <p className="admin-sidebar__label" role="status">Loading projects...</p>
      )}
      {projectsStatus === 'error' && (
        <div className="admin-sidebar__label" role="alert">
          <p>Couldn&apos;t load projects.</p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Retry
          </button>
        </div>
      )}
      {projectsStatus === 'forbidden' && (
        <p className="admin-sidebar__label" role="alert">You don&apos;t have access to these projects.</p>
      )}
      {projectsStatus === 'ready' && projects.length === 0 && (
        <p className="admin-sidebar__label">No responsible projects yet.</p>
      )}
      {projectsStatus === 'ready' && projects.length > 0 && (
        <nav className="admin-sidebar__team-list" aria-labelledby="admin-sidebar-projects-label">
          {projects.map((project) => (
            <Link
              to={`/projects/${project.id}/board`}
              key={project.id}
              className="admin-sidebar__team-btn"
            >
              {project.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="admin-sidebar__bottom">
        <Link to="/settings" className="admin-sidebar__settings">
          <span aria-hidden="true">⚙</span> System Settings
        </Link>
        <button type="button" className="admin-sidebar__signout" onClick={handleSignOut}>
          <span aria-hidden="true">⎋</span> Sign out
        </button>
      </div>
    </aside>
  );
}
