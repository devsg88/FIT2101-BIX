import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGE_LABELS } from '../context/BoardContext.jsx';
import { getProjectPbis } from '../services/api.js';

// US-04b / SCRUM-151. The Admin's Product Backlog list for one project: every
// PBI with its title, priority and status. Admin-only at the route level (see
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

function PbiRow({ pbi }) {
  return (
    <li className="pbi-backlog__row">
      <span className="pbi-backlog__title">{pbi.title}</span>
      <span className="pbi-backlog__priority">{formatPriority(pbi.priority)}</span>
      <span className={`pbi-backlog__status pbi-backlog__status--${pbi.stage}`}>
        {STAGE_LABELS[pbi.stage] ?? pbi.stage}
      </span>
    </li>
  );
}

export default function ProductBacklog() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const token = user?.token;

  const [pbis, setPbis] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

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
        <h1 className="pbi-backlog__heading">Product Backlog</h1>

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
            </div>
            <ul className="pbi-backlog__list">
              {pbis.map((pbi) => (
                <PbiRow key={pbi.id} pbi={pbi} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
