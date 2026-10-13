import { STAGE_LABELS } from '../../context/BoardContext.jsx';

// PBIs have no priority field yet (see ProductBacklog.jsx), so this shows a
// real value as soon as the backend returns one, and "Not set" until then.
function formatPriority(priority) {
  if (priority === undefined || priority === null || priority === '') {
    return 'Not set';
  }
  const text = String(priority);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// US-07 / SCRUM-199. The project's Current Focus, shown above the board
// columns. Renders nothing at all when there is no focus, so a project
// without one looks exactly like the board did before. Display only: the
// Admin sets and clears the focus on Manage Backlog (ProductBacklog.jsx).
export default function CurrentFocusBanner({ focusedPbi }) {
  if (!focusedPbi) {
    return null;
  }

  return (
    <section className="current-focus" aria-labelledby="current-focus-heading">
      <div className="current-focus__body">
        <p id="current-focus-heading" className="current-focus__label">
          Current Focus
        </p>
        <h2 className="current-focus__title">{focusedPbi.title}</h2>
        <dl className="current-focus__meta">
          <div>
            <dt>Priority</dt>
            <dd>{formatPriority(focusedPbi.priority)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{STAGE_LABELS[focusedPbi.stage] ?? focusedPbi.stage}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
