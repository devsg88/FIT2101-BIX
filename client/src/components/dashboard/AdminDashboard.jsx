import { useState } from 'react';
import AdminSidebar from './AdminSidebar.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';

export default function AdminDashboard({ data }) {
  const [showCreateProject, setShowCreateProject] = useState(false);
  // Real, from the backend (dashboardController.js). Metrics that require a
  // team-to-project relationship are deliberately omitted until that
  // relationship exists in the schema.
  const teamCount = data?.data?.teamCount ?? null;

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
      </main>

      {showCreateProject && (
        <CreateProjectModal onClose={() => setShowCreateProject(false)} />
      )}
    </div>
  );
}
