import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectSprints, getSprintBurndown } from '../services/api.js';
import BurndownChart, { formatDayLabel } from '../components/burndown/BurndownChart.jsx';

// US-15 Sprint Burndown Chart (SCRUM-158).
//
// One project's Sprint burndown. Every value on the chart comes from the
// backend (GET /api/projects/:projectId/sprints/:sprintId/burndown), which
// builds it from the Sprint and its work items; nothing here is entered by
// hand. Who may see it is decided by the backend (project member or
// responsible Admin), the same rule as the board.

// The Sprint to show first: the active one, otherwise the most recently
// started one, otherwise the first in the list.
export function pickDefaultSprint(sprints) {
  const active = sprints.find((sprint) => sprint.status === 'active');
  if (active) {
    return active;
  }
  const started = sprints
    .filter((sprint) => sprint.started_at)
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  return started[0] ?? sprints[0] ?? null;
}

export default function Burndown() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const token = user?.token;

  const [sprints, setSprints] = useState([]);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [burndown, setBurndown] = useState(null);

  useEffect(() => {
    getProjectSprints(projectId, token).then((data) => {
      const list = Array.isArray(data.sprints) ? data.sprints : [];
      setSprints(list);
      setSelectedSprintId(pickDefaultSprint(list)?.id ?? null);
    });
  }, [projectId, token]);

  useEffect(() => {
    if (!selectedSprintId) {
      return;
    }
    getSprintBurndown(projectId, selectedSprintId, token).then(setBurndown);
  }, [projectId, selectedSprintId, token]);

  return (
    <div className="burndown-page">
      <header className="project-board__topbar">
        <Link to="/dashboard" className="project-board__brand">BIX</Link>
        <h1 className="burndown-page__title">Sprint Burndown</h1>
        <Link to={`/projects/${projectId}/board`} className="burndown-page__back">
          {'<- Back to board'}
        </Link>
      </header>

      <main className="burndown-page__content">
        {burndown && (
          <>
            <p className="burndown-page__summary">
              <strong>{burndown.sprint.name}</strong>
              {burndown.sprint.startDate && burndown.sprint.endDate && (
                <> {formatDayLabel(burndown.sprint.startDate)} to {formatDayLabel(burndown.sprint.endDate)}</>
              )}
              {' '}{burndown.remainingPoints} of {burndown.totalPoints} Story Points remaining
            </p>
            {burndown.series.length > 0 && (
              <BurndownChart series={burndown.series} totalPoints={burndown.totalPoints} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
