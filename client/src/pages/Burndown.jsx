import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectSprints, getSprintBurndown } from '../services/api.js';
import BurndownChart, { formatDayLabel } from '../components/burndown/BurndownChart.jsx';

// US-15 Sprint Burndown Chart (SCRUM-158, SCRUM-159).
//
// One project's Sprint burndown. Every value on the chart comes from the
// backend (GET /api/projects/:projectId/sprints/:sprintId/burndown), which
// builds it from the Sprint and its work items; nothing here is entered by
// hand. Who may see it is decided by the backend (project member or
// responsible Admin), the same rule as the board.
//
// The selected Sprint lives in the URL (?sprint=<id>), so a chart can be
// bookmarked or shared and the back button returns to the previous Sprint.

const SPRINT_STATUS_LABELS = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed'
};

// What to say instead of a chart, keyed by the backend's emptyReason (see
// EMPTY_REASONS in server/src/utils/burndown.js).
export const EMPTY_MESSAGES = {
  not_started: 'This Sprint has not started yet, so there is no burndown to show.',
  no_estimates: 'None of this Sprint\'s items have Story Points estimated yet, so there is nothing to burn down.',
  no_end_date: 'This Sprint\'s items have no planned end dates, so the Sprint end date is unknown.',
  invalid_dates: 'This Sprint\'s dates cannot be charted: its items\' planned end dates fall before the Sprint start, or too far after it.'
};

const FALLBACK_EMPTY_MESSAGE = 'There is no burndown data for this Sprint yet.';

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

function SprintPicker({ sprints, selectedSprintId, onChange }) {
  return (
    <label className="burndown-page__picker">
      Sprint
      <select
        value={selectedSprintId ?? ''}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {sprints.map((sprint) => (
          <option key={sprint.id} value={sprint.id}>
            {sprint.name} ({SPRINT_STATUS_LABELS[sprint.status] ?? sprint.status})
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Burndown() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const token = user?.token;
  const [searchParams, setSearchParams] = useSearchParams();

  const [sprints, setSprints] = useState([]);
  const [sprintsStatus, setSprintsStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [sprintsError, setSprintsError] = useState(null);
  const [burndown, setBurndown] = useState(null);
  const [burndownStatus, setBurndownStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [burndownError, setBurndownError] = useState(null);

  // A ?sprint= id only counts if it is one of this project's Sprints;
  // anything else falls back to the default Sprint.
  const requestedId = Number(searchParams.get('sprint'));
  const requested = sprints.find((sprint) => sprint.id === requestedId);
  const selectedSprintId = (requested ?? pickDefaultSprint(sprints))?.id ?? null;

  const selectSprint = (sprintId) => setSearchParams({ sprint: String(sprintId) });

  // Each loader takes an `isCurrent` check so a slow response for a previous
  // project or Sprint cannot overwrite the one now selected. Both double as
  // the Retry action.
  const loadSprints = useCallback(
    async (isCurrent = () => true) => {
      setSprintsStatus('loading');
      setSprintsError(null);
      try {
        const data = await getProjectSprints(projectId, token);
        if (!isCurrent()) return;
        setSprints(Array.isArray(data.sprints) ? data.sprints : []);
        setSprintsStatus('ready');
      } catch (err) {
        if (!isCurrent()) return;
        setSprintsError(err?.message || 'Something went wrong loading the Sprints.');
        setSprintsStatus('error');
      }
    },
    [projectId, token]
  );

  const loadBurndown = useCallback(
    async (isCurrent = () => true) => {
      if (!selectedSprintId) {
        setBurndown(null);
        setBurndownStatus('idle');
        return;
      }
      setBurndownStatus('loading');
      setBurndownError(null);
      try {
        const data = await getSprintBurndown(projectId, selectedSprintId, token);
        if (!isCurrent()) return;
        setBurndown(data);
        setBurndownStatus('ready');
      } catch (err) {
        if (!isCurrent()) return;
        setBurndownError(err?.message || 'Something went wrong loading the burndown.');
        setBurndownStatus('error');
      }
    },
    [projectId, selectedSprintId, token]
  );

  useEffect(() => {
    let current = true;
    loadSprints(() => current);
    return () => {
      current = false;
    };
  }, [loadSprints]);

  useEffect(() => {
    let current = true;
    loadBurndown(() => current);
    return () => {
      current = false;
    };
  }, [loadBurndown]);

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
        {sprintsStatus === 'loading' && (
          <p className="burndown-page__status">Loading Sprints...</p>
        )}

        {sprintsStatus === 'error' && (
          <div className="burndown-page__status" role="alert">
            <p>Couldn&apos;t load this project&apos;s Sprints: {sprintsError}</p>
            <button type="button" onClick={() => loadSprints()}>Retry</button>
          </div>
        )}

        {sprintsStatus === 'ready' && sprints.length === 0 && (
          <p className="burndown-page__empty">
            This project has no Sprints yet. A burndown appears once a Sprint is planned and started.
          </p>
        )}

        {sprintsStatus === 'ready' && sprints.length > 0 && (
          <SprintPicker
            sprints={sprints}
            selectedSprintId={selectedSprintId}
            onChange={selectSprint}
          />
        )}

        {burndownStatus === 'loading' && (
          <p className="burndown-page__status">Loading burndown...</p>
        )}

        {burndownStatus === 'error' && (
          <div className="burndown-page__status" role="alert">
            <p>Couldn&apos;t load the burndown: {burndownError}</p>
            <button type="button" onClick={() => loadBurndown()}>Retry</button>
          </div>
        )}

        {burndownStatus === 'ready' && burndown && (
          <>
            <p className="burndown-page__summary" data-testid="burndown-summary">
              <strong>{burndown.sprint.name}</strong>
              {burndown.sprint.startDate && burndown.sprint.endDate && (
                <span>
                  {formatDayLabel(burndown.sprint.startDate)} to {formatDayLabel(burndown.sprint.endDate)}
                </span>
              )}
              <span>
                {burndown.remainingPoints} of {burndown.totalPoints} Story Points remaining
              </span>
            </p>
            {burndown.emptyReason || burndown.series.length === 0 ? (
              <p className="burndown-page__empty">
                {EMPTY_MESSAGES[burndown.emptyReason] ?? FALLBACK_EMPTY_MESSAGE}
              </p>
            ) : (
              <BurndownChart series={burndown.series} totalPoints={burndown.totalPoints} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
