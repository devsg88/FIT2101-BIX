import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectAnalytics } from '../services/api.js';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import AccessDenied from '../components/common/AccessDenied.jsx';
import EffortChart from '../components/analytics/EffortChart.jsx';
import './SprintAnalytics.css';

function ProjectResults({ data }) {
  const hasRecords = data.effort.some((point) => point.recorded_items > 0);
  const missing = data.effort.reduce((sum, point) => sum + point.missing_actual_hours, 0);
  const names = new Map(data.projects.map((project) => [project.id, project.name]));

  return (
    <>
      <div className="sprint-analytics__section-heading">
        <h2>Recorded Actual Hours</h2>
        <span>{data.projects.length} projects / {data.developers.length} developers</span>
      </div>
      {data.projects.length === 0 && <p className="sprint-analytics__state">No responsible projects yet.</p>}
      {data.projects.length > 0 && !hasRecords && (
        <p className="sprint-analytics__state">No developer Actual Hours recorded for these projects yet.</p>
      )}
      {missing > 0 && <p className="sprint-analytics__notice" role="status">
        {missing} completed work {missing === 1 ? 'item has' : 'items have'} no recorded Actual Hours. Totals are incomplete.
      </p>}
      {data.developers.length > 0 && (
        <EffortChart groups={data.projects} groupKey="project_id" developers={data.developers} effort={data.effort} />
      )}
      {data.unattributed.length > 0 && (
        <section className="sprint-analytics__unattributed">
          <h2>Unattributed work</h2>
          <table>
            <caption>Completed work without a recorded developer allocation</caption>
            <thead><tr><th scope="col">Project</th><th scope="col">Actual Hours</th>
              <th scope="col">Items missing Actual Hours</th></tr></thead>
            <tbody>{data.unattributed.map((row) => (
              <tr key={row.project_id}>
                <th scope="row">{names.get(row.project_id)} (#{row.project_id})</th>
                <td>{row.recorded_items ? `${row.actual_hours.toLocaleString()} h` : 'Not recorded'}</td>
                <td>{row.missing_actual_hours}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

export default function ProjectAnalytics() {
  const { user } = useAuth();
  const token = user?.token;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    getProjectAnalytics(token).then((data) => {
      if (current) setState({ status: 'ready', data });
    }).catch((err) => {
      if (current) setState({ status: err.status === 403 ? 'forbidden' : 'error', error: err.message });
    });
    return () => { current = false; };
  }, [token, attempt]);

  return (
    <div className="admin-dashboard sprint-analytics project-analytics">
      <AdminSidebar />
      <main className="admin-dashboard__main sprint-analytics__main">
        <header className="sprint-analytics__header"><h1>Project analytics</h1></header>
        {state.status === 'loading' && <p role="status">Loading Project analytics...</p>}
        {state.status === 'forbidden' && <AccessDenied />}
        {state.status === 'error' && <div className="sprint-analytics__state" role="alert">
          <p>{state.error || 'Could not load Project analytics.'}</p>
          <button type="button" className="admin-btn admin-btn--filter"
            onClick={() => setAttempt((value) => value + 1)}>Retry</button>
        </div>}
        {state.status === 'ready' && <ProjectResults data={state.data} />}
      </main>
    </div>
  );
}
