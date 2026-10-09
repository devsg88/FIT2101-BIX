import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import WorkItemEditor from '../components/board/WorkItemEditor.jsx';
import {
  BoardProvider,
  useBoard,
  STAGE_LABELS
} from '../context/BoardContext.jsx';
import { getCompletedWork } from '../services/api.js';

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

  if (pbi.actual_hours != null) {
    parts.push(`Actual: ${Number(pbi.actual_hours)}h`);
  }

  return <p className="project-board__card-meta">{parts.join(' | ')}</p>;
}

// The title + status inline edit form shown in place of a checklist row's
// normal display while it is being edited. Shared by both tasks and
// sub-tasks (kind picks which board action gets called on save).
//
// Edit never completes or reopens work - that is the US-11 Complete action,
// which records actual hours and checks its prerequisites (the backend rejects
// it too). So an open item can only move between To do and In progress, and a
// done item keeps its status locked at Done while its title is edited.
function ChecklistEditForm({ item, onSave, onCancel }) {
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const isDoneItem = item.status === 'done';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ title, status });
      // No local reset of isEditing here - the parent (ChecklistRow) owns
      // that state and closes the form on a successful save.
    } catch (err) {
      setError(err?.message || 'Something went wrong saving this item. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="project-board__checklist-edit" onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={isSaving}
        aria-label="Title"
        required
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        disabled={isSaving || isDoneItem}
        aria-label="Status"
      >
        {isDoneItem ? (
          <option value="done">Done</option>
        ) : (
          <>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
          </>
        )}
      </select>
      <div className="project-board__checklist-edit-actions">
        <button type="submit" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </form>
  );
}

// Assignee dropdown (US-04a / SCRUM-124). Shown only when canManage (admin),
// same gating as Edit/Delete - the backend's assign endpoints are also
// requireRole('admin'). Sourced from the project's member list
// (BoardContext's `members`, loaded via SCRUM-122's
// GET /api/projects/:projectId/members). Changing the selection assigns
// immediately, there is no separate Save step - a native <select> normally
// works that way, and it keeps this control as a single click rather than
// a mini-form.
function AssigneeSelect({ item, kind, pbiId, taskId }) {
  const { members, assignTask, assignSubTask } = useBoard();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (event) => {
    const rawValue = event.target.value;
    const assigneeId = rawValue === '' ? null : Number(rawValue);
    setIsSaving(true);
    setError(null);
    try {
      if (kind === 'task') {
        await assignTask(pbiId, item.id, assigneeId);
      } else {
        await assignSubTask(pbiId, taskId, item.id, assigneeId);
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong saving the assignment. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // item.assignee_id comes back from the API as a string (Postgres bigint -
  // see the identical note in server/src/controllers/taskController.js), so
  // it is coerced to a string here too for a reliable <select> value match
  // regardless of whether it arrived as a string or a number.
  const currentValue = item.assignee_id == null ? '' : String(item.assignee_id);

  return (
    <span className="project-board__checklist-assignee">
      <select
        value={currentValue}
        onChange={handleChange}
        disabled={isSaving}
        aria-label={`Assignee for ${item.title}`}
      >
        <option value="">Unassigned</option>
        {members.map((member) => (
          <option key={member.id} value={String(member.id)}>
            {member.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </span>
  );
}

// One row in a task/sub-task checklist. Read-only display + checkbox always
// shows (there is still no "toggle status" feature) - editing status happens
// through Edit, not the checkbox. Edit/Delete controls (US-04a/SCRUM-123)
// only render for an admin, matching the backend's requireRole('admin') on
// every endpoint they call: a developer would only ever see the same 403
// this component already knows how to display as an error, so the controls
// are hidden rather than offered and then rejected.
function ChecklistRow({ item, kind, pbiId, taskId, canManage }) {
  const { editTask, deleteTask, editSubTask, deleteSubTask } = useBoard();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (payload) => {
    if (kind === 'task') {
      await editTask(pbiId, item.id, payload);
    } else {
      await editSubTask(pbiId, taskId, item.id, payload);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    // A real confirm dialog, not a custom one - deleting a task/sub-task is
    // destructive and there is no undo (see taskController.js), so this
    // deliberately interrupts rather than being one accidental click away.
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      if (kind === 'task') {
        await deleteTask(pbiId, item.id);
      } else {
        await deleteSubTask(pbiId, taskId, item.id);
      }
      // No local "removed" state to reset on success: the item is gone from
      // the refreshed board and this component unmounts along with it.
    } catch (err) {
      setError(err?.message || 'Something went wrong deleting this item. Please try again.');
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <ChecklistEditForm
        item={item}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="project-board__checklist-row">
      <label className="project-board__checklist-item">
        <input type="checkbox" checked={item.status === 'done'} disabled readOnly />
        <span>{item.title}</span>
      </label>
      {canManage && (
        <AssigneeSelect item={item} kind={kind} pbiId={pbiId} taskId={taskId} />
      )}
      {canManage && (
        <span className="project-board__checklist-actions">
          <button type="button" onClick={() => setIsEditing(true)}>
            Edit
          </button>
          <button type="button" onClick={handleDelete} disabled={isDeleting} aria-busy={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </span>
      )}
      {error && (
        <p className="project-board__card-error" role="alert">{error}</p>
      )}
    </div>
  );
}

function sameUserId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function isDone(status) {
  return status === 'done';
}

function SubTaskCompleteButton({ subTask }) {
  const { completeAssignedSubTask } = useBoard();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await completeAssignedSubTask(subTask.id);
    } catch (err) {
      setError(err?.message || 'Could not complete this sub-task.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="project-board__complete-inline">
      <button type="button" onClick={handleClick} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Mark complete'}
      </button>
      {error && <p className="project-board__card-error" role="alert">{error}</p>}
    </div>
  );
}

// US-11 — Yichi Zhang (SCRUM-130 / SCRUM-131)
// Assigned developer enters positive actual hours; recorded effort is shown
// on the task after save. Never writes Estimated Hours.
function TaskCompleteForm({ task }) {
  const { user } = useAuth();
  const { completeAssignedTask } = useBoard();
  const [hours, setHours] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const isAssignee = sameUserId(user?.id, task.assignee_id);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const actualHours = Number(hours);
    if (!Number.isFinite(actualHours) || actualHours <= 0) {
      setError('Actual hours must be greater than 0');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await completeAssignedTask(task.id, actualHours);
    } catch (err) {
      setError(err?.message || 'Could not complete this task.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAssignee) {
    return (
      <p className="project-board__hint">
        Only the assigned developer can complete this task.
      </p>
    );
  }

  return (
    <form className="project-board__complete-form" onSubmit={handleSubmit} noValidate>
      <label className="project-board__planning-label">
        Actual hours
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          disabled={isSaving}
          aria-label={`Actual hours for ${task.title}`}
        />
      </label>
      <button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Complete task'}
      </button>
      {error && <p className="project-board__card-error" role="alert">{error}</p>}
    </form>
  );
}

function TaskWork({ task, pbiStage, pbiId, canManage }) {
  const canComplete = pbiStage === 'active_sprint' && !isDone(task.status);
  const logged = task.actual_hours != null ? Number(task.actual_hours) : null;

  return (
    <li>
      <ChecklistRow item={task} kind="task" pbiId={pbiId} canManage={canManage} />
      {task.description && <p className="project-board__work-description">{task.description}</p>}
      {pbiStage === 'sprint_planning' && (
        <WorkItemEditor kind="task" parentId={pbiId} item={task} />
      )}
      {logged != null && (
        <p className="project-board__logged-effort">Logged: {logged}h</p>
      )}
      {canComplete && <TaskCompleteForm task={task} />}
      {task.subTasks?.length > 0 && (
        <ul className="project-board__checklist project-board__checklist--nested">
          {task.subTasks.map((subTask) => (
            <li key={subTask.id}>
              <ChecklistRow
                item={subTask}
                kind="subTask"
                pbiId={pbiId}
                taskId={task.id}
                canManage={canManage}
              />
              {subTask.description && <p className="project-board__work-description">{subTask.description}</p>}
              {pbiStage === 'sprint_planning' && (
                <WorkItemEditor kind="subTask" parentId={task.id} item={subTask} />
              )}
              {pbiStage === 'active_sprint' && !isDone(subTask.status) && (
                <SubTaskCompleteButton subTask={subTask} />
              )}
            </li>
          ))}
        </ul>
      )}
      {pbiStage === 'sprint_planning' && (
        <div className="project-board__checklist--nested">
          <WorkItemEditor kind="subTask" parentId={task.id} parentTitle={task.title} />
        </div>
      )}
    </li>
  );
}

// Shows a PBI's tasks, and each task's sub-tasks nested underneath it. Renders
// nothing if the PBI has no tasks yet, same as the design has no checklist on
// a card with no tasks.
function TaskChecklist({ tasks, pbiStage, pbiId, canManage }) {
  if (!tasks || tasks.length === 0) {
    return null;
  }

  return (
    <ul className="project-board__checklist">
      {tasks.map((task) => (
        <TaskWork
          key={task.id}
          task={task}
          pbiStage={pbiStage}
          pbiId={pbiId}
          canManage={canManage}
        />
      ))}
    </ul>
  );
}

function CompletePbiButton({ pbi }) {
  const { completeActivePbi } = useBoard();
  const [hours, setHours] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const tasks = pbi.tasks || [];
  const hasTasks = tasks.length > 0;
  const allTasksDone = hasTasks && tasks.every((task) => isDone(task.status));
  const canComplete = !hasTasks || allTasksDone;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = {};
      if (!hasTasks) {
        const actualHours = Number(hours);
        if (!Number.isFinite(actualHours) || actualHours <= 0) {
          setError('Actual hours must be greater than 0');
          setIsSaving(false);
          return;
        }
        payload.actual_hours = actualHours;
      }
      await completeActivePbi(pbi.id, payload);
    } catch (err) {
      setError(err?.message || 'Could not complete this item.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="project-board__complete-form" onSubmit={handleSubmit}>
      {!hasTasks && (
        <label className="project-board__planning-label">
          Actual hours
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            disabled={isSaving}
            aria-label={`Actual hours for ${pbi.title}`}
          />
        </label>
      )}
      <button
        type="submit"
        disabled={!canComplete || isSaving}
        title={
          canComplete
            ? 'Move this item to Completed and record collaborators'
            : 'Complete every task first'
        }
      >
        {isSaving ? 'Saving...' : 'Complete PBI'}
      </button>
      {error && <p className="project-board__card-error" role="alert">{error}</p>}
    </form>
  );
}

// The only single-PBI move this board offers. Only ever shown on a
// Product Backlog card (see PbiCard below), which keeps the moves the UI
// offers in step with the moves the backend actually allows
// (server/src/constants/stageTransitions.js). The other two moves in that
// map are not single-PBI actions: Active Sprint is reached in bulk via
// Start Sprint (US-10 Yichi Zhang); Completed is not offered here yet.
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

// US-08b  Yichi Zhang.
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

// US-10  Yichi Zhang.
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

// One PBI card shown inside a column. canManage (true for an admin) gates
// the task/sub-task Edit/Delete controls - see ChecklistRow.
function PbiCard({ pbi, canManage }) {
  return (
    <article className="project-board__card">
      <h3 className="project-board__card-title">{pbi.title}</h3>
      {pbi.description && (
        <p className="project-board__card-description">{pbi.description}</p>
      )}
      <PbiMeta pbi={pbi} />
      <TaskChecklist
        tasks={pbi.tasks}
        pbiStage={pbi.stage}
        pbiId={pbi.id}
        canManage={canManage}
      />
      {pbi.stage === 'sprint_planning' && (
        <WorkItemEditor kind="task" parentId={pbi.id} parentTitle={pbi.title} />
      )}
      {pbi.stage === 'product_backlog' && (
        <MoveToSprintPlanningButton pbiId={pbi.id} />
      )}
      {pbi.stage === 'sprint_planning' && <PlanningForm pbi={pbi} />}
      {pbi.stage === 'active_sprint' && <CompletePbiButton pbi={pbi} />}
    </article>
  );
}

// The four columns, one per stage, each showing its own PBIs (or an empty message).
function BoardColumns() {
  const { stages, pbisByStage } = useBoard();
  // US-04a: only an admin can edit/delete Tasks/Sub-tasks (matches the
  // backend's requireRole('admin') on every one of those endpoints).
  const { user } = useAuth();
  const canManage = user?.role === 'admin';

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
              pbisByStage[stage].map((pbi) => (
                <PbiCard key={pbi.id} pbi={pbi} canManage={canManage} />
              ))
            )}
            {stage === 'sprint_planning' && <StartSprintButton />}
          </div>
        </section>
      ))}
    </div>
  );
}

// The board's (project's) name, with Rename and Delete for an Admin (US-04c).
// The board route only lets an Admin load a board they are responsible for,
// so any Admin who can see this title may manage it; the backend still checks
// responsibility on each action itself. Everyone else sees just the name.
function ProjectTitle({ project }) {
  const { user } = useAuth();
  const { renameProject, deleteCurrentProject } = useBoard();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const canManageBoard = user?.role === 'admin' && project != null;

  const startEditing = () => {
    setName(project.name);
    setError(null);
    setDeleteError(null);
    setIsEditing(true);
  };

  // Deleting the board deletes the project. The backend only allows it while
  // the board has no PBIs or sprints (409 otherwise), so a refusal is shown
  // here and the board stays as it is.
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCurrentProject();
      navigate('/dashboard');
    } catch (err) {
      setDeleteError(err?.message || 'Something went wrong deleting this board. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('A project name is required');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await renameProject(trimmedName);
      setIsEditing(false);
    } catch (err) {
      // Stay in the form so the name can be corrected and saved again.
      setError(err?.message || 'Something went wrong renaming this board. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form className="project-board__checklist-edit" onSubmit={handleSubmit} noValidate>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSaving}
          aria-label="Project name"
        />
        <div className="project-board__checklist-edit-actions">
          <button type="submit" disabled={isSaving} aria-busy={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving}>
            Cancel
          </button>
        </div>
        {error && (
          <p className="project-board__card-error" role="alert">{error}</p>
        )}
      </form>
    );
  }

  return (
    <>
      <span className="project-board__project-pill">
        {project?.name ?? 'Project board'}
      </span>
      {canManageBoard && (
        <span className="project-board__checklist-edit-actions">
          <button type="button" onClick={startEditing} disabled={isDeleting}>
            Rename
          </button>
          {/* "Delete board", not just "Delete": the task/sub-task rows below
              have their own Delete buttons, and this removes the whole board. */}
          <button type="button" onClick={handleDelete} disabled={isDeleting} aria-busy={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete board'}
          </button>
        </span>
      )}
      {deleteError && (
        <p className="project-board__card-error" role="alert">{deleteError}</p>
      )}
    </>
  );
}

// The bar across the top of the page: brand mark (links home), the current
// project's name, a way into the completed-work history, and who is logged
// in. Shown in every state (loading, error, ready) since none of it depends
// on the board having finished loading.
function BoardTopBar({ project, onOpenHistory }) {
  const { user } = useAuth();
  const { projectId } = useBoard();
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <header className="project-board__topbar">
      <Link to="/dashboard" className="project-board__brand">BIX</Link>
      <ProjectTitle project={project} />
      {/* US-04b: Admins manage PBIs from the backlog page. */}
      {user?.role === 'admin' && (
        <Link to={`/projects/${projectId}/backlog`} className="pbi-backlog__board-link">
          Manage backlog
        </Link>
      )}
      {/* US-15: the Sprint burndown for this project. */}
      <Link to={`/projects/${projectId}/burndown`} className="project-board__burndown-link">
        {'Burndown ->'}
      </Link>
      <button
        type="button"
        className="project-board__history-button"
        onClick={onOpenHistory}
        title="View this project's completed work history"
      >
        {'Work History ->'}
      </button>
      <div className="project-board__user">
        <span className="project-board__user-name">{user?.name}</span>
        <span className="project-board__avatar" aria-hidden="true">{initial}</span>
      </div>
    </header>
  );
}

// One completed PBI's row in the history sidebar. Shows the four fields this
// subtask asks for - task name, Sprint, completion date, recorded effort -
// as a small label/value grid, plus its Tasks/Sub-tasks underneath via the
// same TaskChecklist the board itself uses (US-12: "a completed-work record
// remains associated with its original PBI and its Tasks/Sub-tasks").
//
// Every value here is read straight off the backend's response, nothing is
// computed or duplicated client-side: Sprint comes from sprint_name
// (completedWorkModel.js joins it from sprint_id), effort from actual_hours
// (US-11's completion data), completion date from updated_at (see the note
// on that field below).
function CompletedWorkItem({ pbi }) {
  const sprintLabel = pbi.sprint_name ?? 'Not recorded';
  const effortLabel = pbi.actual_hours != null ? `${Number(pbi.actual_hours)}h` : 'Not recorded';
  // collaborators comes from completedWorkModel.js's join onto
  // pbi_collaborators (US-11). An empty array is a real, honest answer for a
  // PBI completed before that table existed or recorded against - shown the
  // same way an unrecorded Effort is, not left blank.
  const collaboratorsLabel =
    pbi.collaborators?.length > 0
      ? pbi.collaborators.map((collaborator) => collaborator.name).join(', ')
      : 'No collaborators recorded';
  const taskCount = pbi.tasks?.length ?? 0;
  // updated_at is the closest thing this schema has to a completion
  // timestamp (there is no dedicated completed_at column yet); it is bumped
  // by every edit to the PBI, not only a move to Completed. Shown as
  // "Completed" per this subtask's requirement, with a tooltip noting what
  // it actually is under the hood, rather than adding a column that does
  // not exist.
  const completedDate = formatShortDate(pbi.updated_at) ?? 'Not recorded';

  return (
    <li className="completed-work__item">
      <h3 className="completed-work__item-title">{pbi.title}</h3>

      <dl className="completed-work__item-fields">
        <div className="completed-work__item-field">
          <dt>Sprint</dt>
          <dd>{sprintLabel}</dd>
        </div>
        <div className="completed-work__item-field">
          <dt>Completed</dt>
          <dd title="Recorded as this item's last-updated date">{completedDate}</dd>
        </div>
        <div className="completed-work__item-field">
          <dt>Effort</dt>
          <dd>{effortLabel}</dd>
        </div>
        <div className="completed-work__item-field completed-work__item-field--wide">
          <dt>Collaborators</dt>
          <dd>{collaboratorsLabel}</dd>
        </div>
      </dl>

      {taskCount > 0 && (
        <p className="completed-work__item-taskcount">
          {taskCount} task{taskCount === 1 ? '' : 's'}
        </p>
      )}
      <TaskChecklist tasks={pbi.tasks} />
    </li>
  );
}

// The Completed Work History sidebar (US-12). Pops out over the board rather
// than being a separate page - see the design note on the /completed-work
// route in App.jsx. Only fetches once opened: there is no reason to load
// history data for a board the user may never open the sidebar on.
//
// 403 from the backend (not an admin, not an assigned member of this
// project) is shown as a dedicated access-denied message, not folded into
// the generic error state - the AC requires this page to never expose
// another project's history to someone who is not permitted to see it, so
// that case must read differently from "the server hiccuped, try again".
function CompletedWorkSidebar({ projectId, token, isOpen, onClose }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error' | 'forbidden'
  const [error, setError] = useState(null);
  const [historyProject, setHistoryProject] = useState(null);
  const [pbis, setPbis] = useState([]);

  const load = useCallback(async () => {
    if (!projectId || !token) {
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const data = await getCompletedWork(projectId, token);
      setHistoryProject(data.project ?? null);
      setPbis(Array.isArray(data.pbis) ? data.pbis : []);
      setStatus('ready');
    } catch (err) {
      // err.status comes from services/api.js's request() helper. A 403 here
      // means the backend has already made the permission decision (admin,
      // or an assigned project member, or neither) - the frontend just
      // reflects it, it never decides access itself.
      if (err?.status === 403) {
        setStatus('forbidden');
      } else {
        setError(err?.message || 'Something went wrong loading the work history. Please try again.');
        setStatus('error');
      }
    }
  }, [projectId, token]);

  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen, load]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="completed-work">
      <button
        type="button"
        className="completed-work__backdrop"
        aria-label="Dismiss work history"
        onClick={onClose}
      />
      <aside className="completed-work__panel" role="dialog" aria-label="Completed work history">
        <div className="completed-work__header">
          <div>
            <h2 className="completed-work__title">Work History</h2>
            <p className="completed-work__subtitle">
              {historyProject?.name ?? 'This project'} - completed tasks and logged effort
            </p>
          </div>
          <button
            type="button"
            className="completed-work__close"
            onClick={onClose}
            aria-label="Close work history"
          >
            ×
          </button>
        </div>

        <div className="completed-work__body">
          {status === 'loading' && (
            <p className="completed-work__status">Loading work history...</p>
          )}

          {status === 'forbidden' && (
            <div className="completed-work__status" role="alert">
              <p>You don&apos;t have permission to view this project&apos;s completed work.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="completed-work__status" role="alert">
              <p>Couldn&apos;t load work history{error ? `: ${error}` : ''}.</p>
              <button type="button" onClick={load}>
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && pbis.length === 0 && (
            <p className="completed-work__empty">Nothing has been completed on this project yet.</p>
          )}

          {status === 'ready' && pbis.length > 0 && (
            <ul className="completed-work__list">
              {pbis.map((pbi) => (
                <CompletedWorkItem key={pbi.id} pbi={pbi} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

// Picks what to show based on the board's current status: loading, error, or ready.
function BoardView() {
  const { status, error, project, projectId, reloadBoard } = useBoard();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The history sidebar's open/closed state lives in the URL (see App.jsx),
  // not in local component state: that is what makes it a real, bookmarkable/
  // shareable route rather than just a UI toggle, and it means the browser's
  // back button closes the sidebar the way a user would expect.
  const isHistoryOpen = location.pathname.endsWith('/completed-work');
  const openHistory = () => navigate(`/projects/${projectId}/completed-work`);
  const closeHistory = () => navigate(`/projects/${projectId}/board`);

  return (
    <div className="project-board">
      <BoardTopBar project={project} onOpenHistory={openHistory} />

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

      <CompletedWorkSidebar
        projectId={projectId}
        token={user?.token}
        isOpen={isHistoryOpen}
        onClose={closeHistory}
      />
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
