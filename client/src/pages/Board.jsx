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
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}`;
}

// The "Est: 16h | Sep 15 - Sep 22" line, or "Status: Unestimated" when
// Sprint Planning hasn't happened for this PBI yet (US-08b hasn't run).
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

// The only PBI move this board currently offers. Only ever shown on a
// Product Backlog card (see PbiCard below), which keeps the moves the UI
// offers in step with the moves the backend actually allows
// (server/src/constants/stageTransitions.js): the other two moves in that
// map, into Active Sprint and into Completed, are not single-PBI actions
// (Active Sprint is only reached in bulk via Start Sprint, not built yet;
// Completed isn't offered here either, not built yet), so no button for them
// exists yet.
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
    } catch (err) {
      setError(err.message);
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
