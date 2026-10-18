import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGE_LABELS } from '../context/BoardContext.jsx';
import { getProjectPbis } from '../services/api.js';
import PbiFormModal from '../components/backlog/PbiFormModal.jsx';
import DeletePbiDialog from '../components/backlog/DeletePbiDialog.jsx';
import AccessDenied from '../components/common/AccessDenied.jsx';

// US-04b / SCRUM-151. The Admin's Product Backlog list for one project: every
// PBI with its title, priority and status, plus create / edit (SCRUM-101) and
// delete with confirmation (SCRUM-102). Admin-only at the route level (see
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

function PbiRow({ pbi, onEdit, onDelete }) {
  // SCRUM-102: the backend refuses to delete a PBI in the Active Sprint, so
  // the button is disabled there rather than offering a doomed action.
  const inActiveSprint = pbi.stage === 'active_sprint';

  return (
    <li className="pbi-backlog__row">
      <span className="pbi-backlog__title">{pbi.title}</span>
      <span className="pbi-backlog__priority">{formatPriority(pbi.priority)}</span>
      <span className={`pbi-backlog__status pbi-backlog__status--${pbi.stage}`}>
        {STAGE_LABELS[pbi.stage] ?? pbi.stage}
      </span>
      <span className="pbi-backlog__actions">
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
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'forbidden'
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
        setStatus('ready');
      } catch (err) {
        if (!isCurrent()) return;
        // NFR-01: an Admin who is not responsible for this project gets a
        // 403 here - that's a permission decision, not a load failure, so
        // it shows AccessDenied rather than the generic Retry treatment.
        if (err?.status === 403) {
          setStatus('forbidden');
        } else {
          setError(err?.message || 'Something went wrong loading the backlog.');
          setStatus('error');
        }
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

        {status === 'forbidden' && <AccessDenied />}

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
                  onEdit={(item) => setForm({ mode: 'edit', pbi: item })}
                  onDelete={setPendingDelete}
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
