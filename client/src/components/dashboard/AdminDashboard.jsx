import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';
import { allTeams, orgStats, productOwnerHandle } from '../../data/orgMockData.js';

export default function AdminDashboard({ data }) {
  const [showCreateProject, setShowCreateProject] = useState(false);

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
            <p className="stat-card__label">Active sprint teams</p>
            <p className="stat-card__value stat-card__value--teal">
              {orgStats.activeSprintTeams}
              <span className="stat-card__value-suffix">/ {orgStats.totalTeams} total teams</span>
            </p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Tasks in progress</p>
            <p className="stat-card__value stat-card__value--orange">
              {orgStats.tasksInProgress}
              <span className="stat-card__value-suffix">across all boards</span>
            </p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Teams blocked / at risk</p>
            <p className="stat-card__value stat-card__value--red">
              {orgStats.teamsAtRisk}
              <span className="stat-card__value-suffix">require admin attention</span>
            </p>
          </div>
        </div>

        <section className="team-health-table">
          <div className="team-health-table__header">
            <h2>Team Health &amp; Active Sprints</h2>
            <button type="button" className="admin-btn admin-btn--filter">
              Filter ▾
            </button>
          </div>

          <div className="team-health-table__columns">
            <span>Team name</span>
            <span>Product owner</span>
            <span>Current project</span>
            <span>Sprint progress</span>
            <span>Status</span>
            <span />
          </div>

          <div className="team-health-table__body">
            {allTeams.map((team) => (
              <div className="team-health-table__row" key={team.id}>
                <Link to={`/teams/${team.id}`} className="team-health-table__name">
                  {team.name}
                </Link>
                <span className="team-health-table__owner">{productOwnerHandle(team)}</span>
                <span className="team-health-table__project">{team.currentProject}</span>
                <span className="team-health-table__progress">
                  <span className="team-health-table__progress-track">
                    <span
                      className={`team-health-table__progress-fill team-health-table__progress-fill--${team.statusType}`}
                      style={{ width: `${team.sprintProgress}%` }}
                    />
                  </span>
                  <span className="team-health-table__progress-value">{team.sprintProgress}%</span>
                </span>
                <span className={`admin-status-pill admin-status-pill--${team.statusType}`}>
                  {team.status}
                </span>
                <button type="button" className="team-health-table__menu" aria-label={`More actions for ${team.name}`}>
                  •••
                </button>
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
