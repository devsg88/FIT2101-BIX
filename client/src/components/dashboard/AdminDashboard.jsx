import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';

function formatCreatedDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export default function AdminDashboard({ data }) {
  const [showCreateProject, setShowCreateProject] = useState(false);
  // Both values come from listTeams() through dashboardController.js.
  // Project/sprint health fields remain omitted because the schema does not
  // currently link teams to projects.
  const teamCount = data?.data?.teamCount ?? null;
  const teams = Array.isArray(data?.data?.teams) ? data.data.teams : [];

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        <div className="admin-dashboard__header">
          <h1>Organization Overview</h1>
          <div className="admin-dashboard__header-actions">
            <button type="button" className="admin-btn admin-btn--outline">
              + Assign Project
            </button>
            <button type="button" className="admin-btn admin-btn--solid">
              + Create Team
            </button>
            {/* US-04d: same styling as "+ Create Team" - no Figma screen exists for this flow. */}
            <button
              type="button"
              className="admin-btn admin-btn--solid"
              onClick={() => setShowCreateProject(true)}
            >
              + Create Project
            </button>
          </div>
        </div>

        <div className="admin-dashboard__stats">
          <div className="stat-card">
            <p className="stat-card__label">Total teams</p>
            <p className="stat-card__value stat-card__value--teal">
              {teamCount ?? 'N/A'}
            </p>
          </div>
        </div>

        <section className="team-health-table" aria-labelledby="team-health-title">
          <div className="team-health-table__header">
            <div>
              <h2 id="team-health-title">Team Health</h2>
              <p>Existing teams in the organization</p>
            </div>
          </div>

          <div className="team-health-table__columns">
            <span>Team name</span>
            <span>Created</span>
            <span>Team details</span>
          </div>

          <div className="team-health-table__body">
            {teams.length === 0 && (
              <p className="team-health-table__empty">No teams yet.</p>
            )}
            {teams.map((team) => (
              <div className="team-health-table__row" key={team.id}>
                <Link to={`/teams/${team.id}`} className="team-health-table__name">
                  {team.name}
                </Link>
                <span className="team-health-table__created">
                  {formatCreatedDate(team.created_at)}
                </span>
                <Link to={`/teams/${team.id}`} className="team-health-table__view-link">
                  View team
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showCreateProject && (
        <CreateProjectModal onClose={() => setShowCreateProject(false)} />
      )}
    </div>
  );
}
