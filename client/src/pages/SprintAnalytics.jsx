import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getResponsibleProjects, getSprintAnalytics } from '../services/api.js';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import AccessDenied from '../components/common/AccessDenied.jsx';
import SprintEffortChart from '../components/analytics/SprintEffortChart.jsx';
import './SprintAnalytics.css';

function LoadError({ message, onRetry }) {
  return <div className="sprint-analytics__state" role="alert"><p>{message}</p>
    <button type="button" className="admin-btn admin-btn--filter" onClick={onRetry}>Retry</button></div>;
}

function AnalyticsResults({ data }) {
  const hasRecords = data.effort.some((point) => point.recorded_items > 0);
  const missing = data.effort.reduce((total, point) => total + point.missing_actual_hours, 0);
  const sprintNames = new Map(data.sprints.map((sprint) => [sprint.id, sprint.name]));
  return (
    <>
      <div className="sprint-analytics__section-heading">
        <h2>Recorded Actual Hours</h2>
        <span>{data.sprints.length} Sprints / {data.developers.length} developers</span>
      </div>
      {data.sprints.length === 0 && <p className="sprint-analytics__state">No Sprints in this project yet.</p>}
      {data.sprints.length > 0 && !hasRecords && (
        <p className="sprint-analytics__state">No developer Actual Hours recorded for these Sprints yet.</p>
      )}
      {missing > 0 && <p className="sprint-analytics__notice" role="status">
        {missing} completed work {missing === 1 ? 'item has' : 'items have'} no recorded Actual Hours. Totals are incomplete.
      </p>}
      {data.developers.length > 0 && (
        <SprintEffortChart sprints={data.sprints} developers={data.developers} effort={data.effort} />
      )}
      {data.unattributed.length > 0 && (
        <section className="sprint-analytics__unattributed">
          <h2>Unattributed work</h2>
          <table>
            <caption>Completed work without a recorded developer allocation or Sprint</caption>
            <thead><tr><th scope="col">Sprint</th><th scope="col">Actual Hours</th>
              <th scope="col">Items missing Actual Hours</th></tr></thead>
            <tbody>{data.unattributed.map((row) => (
              <tr key={row.sprint_id ?? 'none'}>
                <th scope="row">{row.sprint_id == null ? 'No Sprint recorded' :
                  `${sprintNames.get(row.sprint_id)} (#${row.sprint_id})`}</th>
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

export default function SprintAnalytics() {
  const { user } = useAuth();
  const token = user?.token;
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState({ status: 'loading', data: [] });
  const [analytics, setAnalytics] = useState({ status: 'loading' });
  const [projectsAttempt, setProjectsAttempt] = useState(0);
  const [analyticsAttempt, setAnalyticsAttempt] = useState(0);
  const requestedProject = searchParams.get('project');
  const project = projects.data.find((item) => String(item.id) === requestedProject) ?? projects.data[0];
  const projectId = project == null ? null : String(project.id);

  useEffect(() => {
    let current = true;
    setProjects({ status: 'loading', data: [] });
    getResponsibleProjects(token).then((data) => {
      if (current) setProjects({ status: 'ready', data: data.projects });
    }).catch((err) => {
      if (current) setProjects({ status: err.status === 403 ? 'forbidden' : 'error', data: [], error: err.message });
    });
    return () => { current = false; };
  }, [token, projectsAttempt]);

  useEffect(() => {
    if (!projectId || projects.status !== 'ready') return undefined;
    let current = true;
    setAnalytics({ status: 'loading', projectId });
    getSprintAnalytics(projectId, token).then((data) => {
      if (current) setAnalytics({ status: 'ready', projectId, data });
    }).catch((err) => {
      if (current) setAnalytics({ status: err.status === 403 ? 'forbidden' : 'error', projectId, error: err.message });
    });
    return () => { current = false; };
  }, [projectId, projects.status, token, analyticsAttempt]);

  const activeAnalytics = analytics.projectId === projectId ? analytics : { status: 'loading' };
  return (
    <div className="admin-dashboard sprint-analytics">
      <AdminSidebar />
      <main className="admin-dashboard__main sprint-analytics__main">
        <header className="sprint-analytics__header"><h1>Sprint analytics</h1>
          {projectId && projects.status === 'ready' && <Link to={`/projects/${projectId}/board`}>View board</Link>}
        </header>
        {projects.status === 'loading' && <p role="status">Loading projects...</p>}
        {projects.status === 'forbidden' && <AccessDenied />}
        {projects.status === 'error' && <LoadError message={projects.error || 'Could not load projects.'}
          onRetry={() => setProjectsAttempt((attempt) => attempt + 1)} />}
        {projects.status === 'ready' && !projectId && <p className="sprint-analytics__state">
          No responsible projects yet.
        </p>}
        {projects.status === 'ready' && projectId && (
          <>
            <label className="sprint-analytics__picker">Project
              <select value={projectId} onChange={(event) => setSearchParams({ project: event.target.value })}>
                {projects.data.map((item) => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
              </select>
            </label>
            {activeAnalytics.status === 'loading' && <p role="status">Loading Sprint analytics...</p>}
            {activeAnalytics.status === 'forbidden' && <AccessDenied />}
            {activeAnalytics.status === 'error' && <LoadError message={activeAnalytics.error || 'Could not load Sprint analytics.'}
              onRetry={() => setAnalyticsAttempt((attempt) => attempt + 1)} />}
            {activeAnalytics.status === 'ready' && <AnalyticsResults data={activeAnalytics.data} />}
          </>
        )}
      </main>
    </div>
  );
}
