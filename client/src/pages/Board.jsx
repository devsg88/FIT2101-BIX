import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  BoardProvider,
  useBoard,
  STAGE_LABELS
} from '../context/BoardContext.jsx';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Turns a "YYYY-MM-DD" (or a longer ISO string starting with one) into
// something short like "Sep 15". Reads the digits directly instead of going
// through `new Date(value)`, so a UTC-midnight date column can never shift to
// the day before or after depending on the viewer's timezone.
function formatShortDate(value) {
  if (!value) {
    return null;
  }
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}`;
}

function dateInputValue(value) {
  if (!value) {
    return '';
  }
  return String(value).slice(0, 10);
}

// True once US-08b has stored hours and both planned dates on this PBI.
function hasPlanningDetails(pbi) {
  return (
    pbi.estimated_hours != null &&
    Boolean(pbi.planned_start_date) &&
    Boolean(pbi.planned_end_date)
  );
}

// The "Est: 16h | Sep 15 - Sep 22" line, or "Status: Unestimated" when
// Sprint Planning (US-08b) has not stored hours/dates for this PBI yet.
function PbiMeta({ pbi }) {
  const hasEstimate = pbi.estimated_hours != null;
  const start = formatShortDate(pbi.planned_start_date);
  const end = formatShortDate(pbi.planned_end_date);

  if (!hasEstimate && !start) {
    return <p className="project-board__card-status">Status: Unestimated</p>;
  }

  const parts = [];
  if (hasEstimate) {
    // estimated_hours comes back from the database as a numeric string
    // (e.g. "16.00"); Number(...) drops the trailing zeros for display.
    parts.push(`Est: ${Number(pbi.estimated_hours)}h`);
  }
  if (start && end) {
    parts.push(`${start} - ${end}`);
  }

  return <p className="project-board__card-meta">{parts.join(' | ')}</p>;
}

// One row in a task/sub-task checklist. Read-only: it shows whether the item
// is done, it does not let you change it, there is no "toggle status" feature yet.
function ChecklistRow({ item }) {
  return (
    <label className="project-board__checklist-item">
      <input type="checkbox" checked={item.status === 'done'} disabled readOnly />
      <span>{item.title}</span>
    </label>
  );
}

// Shows a PBI's tasks, and each task's sub-tasks nested underneath it. Renders
// nothing if the PBI has no tasks yet, same as the design has no checklist on
// a card with no tasks.
function TaskChecklist({ tasks }) {
  if (!tasks || tasks.length === 0) {
    return null;
  }

  return (
    <ul className="project-board__checklist">
      {tasks.map((task) => (
        <li key={task.id}>
          <ChecklistRow item={task} />
          {task.subTasks?.length > 0 && (
            <ul className="project-board__checklist project-board__checklist--nested">
              {task.subTasks.map((subTask) => (
                <li key={subTask.id}>
                  <ChecklistRow item={subTask} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// The only single-PBI move this board offers. Only ever shown on a
// Product Backlog card (see PbiCard below), which keeps the moves the UI
// offers in step with the moves the backend actually allows
// (server/src/constants/stageTransitions.js). The other two moves in that
// map are not single-PBI actions: Active Sprint is reached in bulk via
// Start Sprint (US-10 — Yichi Zhang); Completed is not offered here yet.
//
// Note for design review: the Figma prototype does not show a button on
// Product Backlog cards at all for this move (its Sprint Planning cards have
// a "Move to Active Sprint" button instead, for a different transition).
// Drag-and-drop is out of scope for now, so a plain button is the
// functional stand-in until that's revisited.
function MoveToSprintPlanningButton({ pbiId }) {
  const { movePbiStage } = useBoard();
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setIsMoving(true);
    setError(null);
    try {
      await movePbiStage(pbiId, 'sprint_planning');
      // No local update on success either: movePbiStage only resolves once
      // the board has been re-fetched and this PBI's card is already
      // rendering from that fresh data (see BoardContext.jsx), so there is
      // nothing left to do here.
    } catch (err) {
      // Every rejection (an invalid move, an expired/missing login, a 403,
      // a 404, a 500, or the network failing outright) reaches here as a
      // thrown Error with a message - see the `request` helper in
      // services/api.js, it never resolves on a failed request. The
      // fallback below only matters if something ever threw a value that
      // was not a proper Error, so this can never end up silently showing
      // nothing while leaving the user unsure what happened.
      setError(err?.message || 'Something went wrong moving this item. Please try again.');
      // Deliberately not touching any board/PBI state here: the PBI is still
      // showing whatever the last successful board load said, i.e. its
      // stage before this attempt, so a failed move never moves the card.
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="project-board__card-action">
      <button
        type="button"
        onClick={handleClick}
        disabled={isMoving}
        aria-busy={isMoving}
        title="Select this item for the next Sprint by moving it into Sprint Planning"
      >
        {isMoving ? 'Moving...' : 'Move to Sprint Planning ->'}
      </button>
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </div>
  );
}

// US-08b — Yichi Zhang.
// Estimate and dates sit *below* the existing card content (title, meta,
// checklist), not in an overlay. Saving does not change stage; Start Sprint
// (US-10) is what moves the card into Active Sprint.
function PlanningForm({ pbi }) {
  const { savePbiPlanning } = useBoard();
  const [estimatedHours, setEstimatedHours] = useState(
    pbi.estimated_hours != null ? String(Number(pbi.estimated_hours)) : ''
  );
  const [startDate, setStartDate] = useState(dateInputValue(pbi.planned_start_date));
  const [endDate, setEndDate] = useState(dateInputValue(pbi.planned_end_date));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await savePbiPlanning(pbi.id, {
        planned_start_date: startDate,
        planned_end_date: endDate,
        estimated_hours: Number(estimatedHours)
      });
    } catch (err) {
      setError(err?.message || 'Something went wrong saving planning details. Please try again.');
      // Leave the form values as the user typed them so they can fix and retry.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="project-board__planning-form" onSubmit={handleSubmit}>
      <p className="project-board__planning-heading">Add estimate &amp; dates</p>
      <label className="project-board__planning-label">
        Story points / hours
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={estimatedHours}
          onChange={(event) => setEstimatedHours(event.target.value)}
          disabled={isSaving}
        />
      </label>
      <label className="project-board__planning-label">
        Start
        <input
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          disabled={isSaving}
        />
      </label>
      <label className="project-board__planning-label">
        End
        <input
          type="date"
          required
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          disabled={isSaving}
        />
      </label>
      <button type="submit" disabled={isSaving} aria-busy={isSaving}>
        {isSaving ? 'Saving...' : 'Save estimate'}
      </button>
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </form>
  );
}

// US-10 — Yichi Zhang.
// Lives at the bottom of the Sprint Planning column so it is not mistaken
// for a per-card action. Disabled until every item in that column has
// estimate + dates (US-08b) and a sprint still in status "planning" exists.
function StartSprintButton() {
  const { sprints, pbisByStage, startPlannedSprint } = useBoard();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);

  const planningSprint = sprints.find((sprint) => sprint.status === 'planning');
  const planningPbis = pbisByStage.sprint_planning;
  const canStart =
    Boolean(planningSprint) &&
    planningPbis.length > 0 &&
    planningPbis.every(hasPlanningDetails);

  const handleClick = async () => {
    if (!planningSprint) {
      return;
    }
    setIsStarting(true);
    setError(null);
    try {
      await startPlannedSprint(planningSprint.id);
    } catch (err) {
      setError(err?.message || 'Something went wrong starting the sprint. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  if (!planningSprint && planningPbis.length === 0) {
    return null;
  }

  return (
    <div className="project-board__start-sprint">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canStart || isStarting}
        aria-busy={isStarting}
        title={
          canStart
            ? 'Move every Sprint Planning item into the Active Sprint together'
            : 'Add estimate and dates to every Sprint Planning item first'
        }
      >
        {isStarting ? 'Starting...' : 'Start Sprint'}
      </button>
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </div>
  );
}

// One PBI card shown inside a column.
function PbiCard({ pbi }) {
  return (
    <article className="project-board__card">
      <h3 className="project-board__card-title">{pbi.title}</h3>
      {pbi.description && (
        <p className="project-board__card-description">{pbi.description}</p>
      )}
      <PbiMeta pbi={pbi} />
      <TaskChecklist tasks={pbi.tasks} />
      {pbi.stage === 'product_backlog' && (
        <MoveToSprintPlanningButton pbiId={pbi.id} />
      )}
      {pbi.stage === 'sprint_planning' && <PlanningForm pbi={pbi} />}
    </article>
  );
}

// The four columns, one per stage, each showing its own PBIs (or an empty message).
function BoardColumns() {
  const { stages, pbisByStage } = useBoard();

  return (
    <div className="project-board__columns">
      {stages.map((stage) => (
        <section className="project-board__column" key={stage}>
          <div className="project-board__column-header">
            <h2 className="project-board__column-title">{STAGE_LABELS[stage]}</h2>
          </div>
          <div className="project-board__column-body">
            {pbisByStage[stage].length === 0 ? (
              <p className="project-board__empty">No items</p>
            ) : (
              pbisByStage[stage].map((pbi) => <PbiCard key={pbi.id} pbi={pbi} />)
            )}
            {stage === 'sprint_planning' && <StartSprintButton />}
          </div>
        </section>
      ))}
    </div>
  );
}

// The bar across the top of the page: brand mark (links home), the current
// project's name, and who is logged in. Shown in every state (loading, error,
// ready) since none of it depends on the board having finished loading.
function BoardTopBar({ project }) {
  const { user } = useAuth();
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <header className="project-board__topbar">
      <Link to="/dashboard" className="project-board__brand">BIX</Link>
      <span className="project-board__project-pill">
        {project?.name ?? 'Project board'}
      </span>
      <div className="project-board__user">
        <span className="project-board__user-name">{user?.name}</span>
        <span className="project-board__avatar" aria-hidden="true">{initial}</span>
      </div>
    </header>
  );
}

// Picks what to show based on the board's current status: loading, error, or ready.
function BoardView() {
  const { status, error, project, reloadBoard } = useBoard();

  return (
    <div className="project-board">
      <BoardTopBar project={project} />

      <main className="project-board__content">
        {status === 'loading' && (
          <p className="project-board__status">Loading board...</p>
        )}

        {status === 'error' && (
          <div className="project-board__status" role="alert">
            <p>Couldn&apos;t load the board{error ? `: ${error}` : ''}.</p>
            <button type="button" onClick={reloadBoard}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && <BoardColumns />}
      </main>
    </div>
  );
}

// Page entry point. Reads the projectId straight from the URL, so this page
// never has to hard-code which project it is showing.
export default function Board() {
  const { projectId } = useParams();

  return (
    <BoardProvider projectId={projectId}>
      <BoardView />
    </BoardProvider>
  );
}
