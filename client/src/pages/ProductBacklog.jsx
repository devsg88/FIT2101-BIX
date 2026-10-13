import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGE_LABELS } from '../context/BoardContext.jsx';
import { getProjectPbis, updateProjectFocus } from '../services/api.js';
import PbiFormModal from '../components/backlog/PbiFormModal.jsx';
import DeletePbiDialog from '../components/backlog/DeletePbiDialog.jsx';

// US-04b / SCRUM-151. The Admin's Product Backlog list for one project: every
// PBI with its title, priority and status, plus create / edit (SCRUM-101) and
// delete with confirmation (SCRUM-102), and Set as Focus / Clear Focus for the
// board's Current Focus banner (US-07). Admin-only at the route level (see
// App.jsx); the backend additionally refuses an Admin who is not responsible
// for this project, and that refusal is shown as the error message below.
//
// Priority: PBIs do not have a priority field yet (pending a team decision on
// its values). The column already reads `pbi.priority`, so it shows real
// values as soon as the backend returns them, and "Not set" until then.

function formatPriority(priority) {
  if (priority === undefined || priority === null || priority === '') {
    return 'Not set';
  }
  const text = String(priority);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// US-07. Sets this PBI as the project's Current Focus, or clears the focus
// when the row already is the focus. onSetFocus resolves once the list has
// been re-fetched, so the badge has already moved when the button re-enables.
function FocusButton({ pbi, isFocused, onSetFocus }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // pg sends bigint ids as strings, but the focus route only accepts a
      // JSON number.
      await onSetFocus(isFocused ? null : Number(pbi.id));
    } catch (err) {
      setError(err?.message || 'Something went wrong updating the focus. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  let label = isFocused ? 'Clear Focus' : 'Set as Focus';
  if (isSaving) {
    label = isFocused ? 'Clearing...' : 'Setting...';
  }

  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn--filter"
        onClick={handleClick}
        disabled={isSaving}
        aria-busy={isSaving}
        aria-label={`${isFocused ? 'Clear Focus' : 'Set as Focus'}: ${pbi.title}`}
        title={
          isFocused
            ? 'Stop showing this item as the Current Focus on the board'
            : "Show this item as the project's Current Focus at the top of the board"
        }
      >
        {label}
      </button>
      {error && (
        <p className="pbi-backlog__row-error" role="alert">{error}</p>
      )}
    </>
  );
}

function PbiRow({ pbi, isFocused, onEdit, onDelete, onSetFocus }) {
  // SCRUM-102: the backend refuses to delete a PBI in the Active Sprint, so
  // the button is disabled there rather than offering a doomed action.
  const inActiveSprint = pbi.stage === 'active_sprint';

  return (
    <li className={`pbi-backlog__row${isFocused ? ' pbi-backlog__row--focused' : ''}`}>
      <span className="pbi-backlog__title">
        {isFocused && <span className="project-board__focus-badge">Current Focus</span>}
        {pbi.title}
      </span>
      <span className="pbi-backlog__priority">{formatPriority(pbi.priority)}</span>
      <span className={`pbi-backlog__status pbi-backlog__status--${pbi.stage}`}>
        {STAGE_LABELS[pbi.stage] ?? pbi.stage}
      </span>
      <span className="pbi-backlog__actions">
        <FocusButton pbi={pbi} isFocused={isFocused} onSetFocus={onSetFocus} />
        <button
          type="button"
          className="admin-btn admin-btn--filter"
          onClick={() => onEdit(pbi)}
          aria-label={`Edit ${pbi.title}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--danger-outline"
          onClick={() => onDelete(pbi)}
          disabled={inActiveSprint}
          aria-label={`Delete ${pbi.title}`}
          title={
            inActiveSprint
              ? 'Items in the Active Sprint cannot be deleted'
              : 'Delete this item'
          }
        >
          Delete
        </button>
      </span>
    </li>
  );
}

export default function ProductBacklog() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const token = user?.token;

  const [pbis, setPbis] = useState([]);
  // US-07: the project's Current Focus PBI id (pg sends it as a string), or
  // null when there is no focus.
  const [focusId, setFocusId] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  // SCRUM-101: which form is open - null (none), { mode: 'create' }, or
  // { mode: 'edit', pbi }.
  const [form, setForm] = useState(null);
  // SCRUM-102: the PBI awaiting delete confirmation, or null.
  const [pendingDelete, setPendingDelete] = useState(null);

  // Also used as the Retry action. `isCurrent` lets the effect below ignore
  // a response that arrives after this page has moved to another project.
  const loadPbis = useCallback(
    async (isCurrent = () => true) => {
      setStatus('loading');
      setError(null);
      try {
        const data = await getProjectPbis(projectId, token);
        if (!isCurrent()) return;
        setPbis(Array.isArray(data.pbis) ? data.pbis : []);
        setFocusId(data.current_focus_pbi_id ?? null);
        setStatus('ready');
      } catch (err) {
        if (!isCurrent()) return;
        setError(err?.message || 'Something went wrong loading the backlog.');
        setStatus('error');
      }
    },
    [projectId, token]
  );

  useEffect(() => {
    let current = true;
    loadPbis(() => current);
    return () => {
      current = false;
    };
  }, [loadPbis]);

  // After any create, edit or delete, re-fetch the list rather than patching
  // it locally, so it shows exactly what the server now holds (same approach
  // as BoardContext). The current list stays on screen while it reloads.
  const refreshAfterChange = async (doneMessage) => {
    try {
      const data = await getProjectPbis(projectId, token);
      setPbis(Array.isArray(data.pbis) ? data.pbis : []);
      setFocusId(data.current_focus_pbi_id ?? null);
    } catch (err) {
      setError(`${doneMessage}, but the list could not be refreshed: ${err.message}`);
      setStatus('error');
    }
  };

  const handleSaved = () => {
    setForm(null);
    return refreshAfterChange('The item was saved');
  };

  const handleDeleted = () => {
    setPendingDelete(null);
    return refreshAfterChange('The item was deleted');
  };

  // US-07: pbiId sets the Current Focus, null clears it. A failed save
  // rejects, so the row's button can show the server's message.
  const handleSetFocus = async (pbiId) => {
    await updateProjectFocus(projectId, pbiId, token);
    await refreshAfterChange('The current focus was saved');
  };

  return (
    <div className="project-board">
      <header className="project-board__topbar">
        <Link to="/dashboard" className="project-board__brand">BIX</Link>
        <span className="project-board__project-pill">Product Backlog</span>
        <Link to={`/projects/${projectId}/board`} className="pbi-backlog__board-link">
          Open board
        </Link>
      </header>

      <main className="project-board__content pbi-backlog">
        <div className="pbi-backlog__header">
          <h1 className="pbi-backlog__heading">Product Backlog</h1>
          {status === 'ready' && (
            <button
              type="button"
              className="admin-btn admin-btn--solid"
              onClick={() => setForm({ mode: 'create' })}
            >
              + New item
            </button>
          )}
        </div>

        {status === 'loading' && (
          <p className="project-board__status">Loading backlog...</p>
        )}

        {status === 'error' && (
          <div className="project-board__status" role="alert">
            <p>Couldn&apos;t load the backlog: {error}</p>
            <button type="button" onClick={() => loadPbis()}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && pbis.length === 0 && (
          <p className="pbi-backlog__empty">
            This project has no Product Backlog Items yet.
          </p>
        )}

        {status === 'ready' && pbis.length > 0 && (
          <section aria-label="Product Backlog Items">
            <div className="pbi-backlog__columns" aria-hidden="true">
              <span>Title</span>
              <span>Priority</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="pbi-backlog__list">
              {pbis.map((pbi) => (
                <PbiRow
                  key={pbi.id}
                  pbi={pbi}
                  isFocused={focusId != null && String(pbi.id) === String(focusId)}
                  onEdit={(item) => setForm({ mode: 'edit', pbi: item })}
                  onDelete={setPendingDelete}
                  onSetFocus={handleSetFocus}
                />
              ))}
            </ul>
          </section>
        )}
      </main>

      {form && (
        <PbiFormModal
          projectId={projectId}
          pbi={form.mode === 'edit' ? form.pbi : null}
          onSaved={handleSaved}
          onClose={() => setForm(null)}
        />
      )}

      {pendingDelete && (
        <DeletePbiDialog
          projectId={projectId}
          pbi={pendingDelete}
          onDeleted={handleDeleted}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
