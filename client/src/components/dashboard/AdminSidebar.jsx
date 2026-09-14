import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { allTeams } from '../../data/orgMockData.js';

// The left-hand nav shown on every admin page (Organization Overview and each
// team's page): brand, team search, a link back to the org overview, the team
// list (each one a real link, not just a label), and settings at the bottom.
//
// Which team is highlighted follows the URL, not its own local state: on a
// team's page (/teams/:teamId) that team is highlighted; anywhere else (the
// org overview) the first team is shown highlighted, matching the Figma
// default. This way the sidebar can be dropped into either page and always
// agree with what's actually on screen.
export default function AdminSidebar() {
  const { teamId } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const activeTeamId = teamId ? Number(teamId) : allTeams[0]?.id;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  const visibleTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return allTeams;
    }
    return allTeams.filter((team) => team.name.toLowerCase().includes(query));
  }, [searchQuery]);

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

      <p className="admin-sidebar__label">Active teams ({allTeams.length})</p>
      <div className="admin-sidebar__team-list">
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

      <div className="admin-sidebar__bottom">
        <button type="button" className="admin-sidebar__settings">
          <span aria-hidden="true">⚙</span> System Settings
        </button>
        <button type="button" className="admin-sidebar__signout" onClick={handleSignOut}>
          <span aria-hidden="true">⎋</span> Sign out
        </button>
      </div>
    </aside>
  );
}
