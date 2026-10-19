import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SprintAnalytics from './SprintAnalytics.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getResponsibleProjects, getSprintAnalytics } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getResponsibleProjects: vi.fn(), getSprintAnalytics: vi.fn() }));
vi.mock('../components/dashboard/AdminSidebar.jsx', () => ({ default: () => <aside>Admin navigation</aside> }));

const projects = [{ id: '1', name: 'BIX Platform' }, { id: '2', name: 'Mobile App' }];
const data = {
  sprints: [{ id: '10', name: 'Iteration' }, { id: '11', name: 'Iteration' }],
  developers: [{ id: '7', name: 'Alex' }],
  effort: [{ sprint_id: '10', developer_id: '7', actual_hours: 3.25, recorded_items: 2, missing_actual_hours: 0 }],
  unattributed: []
};
const empty = { sprints: [], developers: [], effort: [], unattributed: [] };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function renderPage(path = '/analytics/sprints') {
  return render(<MemoryRouter initialEntries={[path]}><SprintAnalytics /></MemoryRouter>);
}

describe('SprintAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: '3', role: 'admin', token: 'admin-token' } });
    getResponsibleProjects.mockResolvedValue({ projects });
    getSprintAnalytics.mockResolvedValue(data);
  });

  it('loads the responsible-project list and plots Sprint Actual Hours, not an average', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects...');
    expect(await screen.findByRole('img', { name: 'Alex (#7), Iteration (#10): 3.25 actual hours' })).toBeInTheDocument();
    expect(getResponsibleProjects).toHaveBeenCalledWith('admin-token');
    expect(getSprintAnalytics).toHaveBeenCalledWith('1', 'admin-token');
    expect(screen.getByRole('heading', { name: 'Recorded Actual Hours' })).toBeInTheDocument();
    expect(screen.queryByText(/average/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View board' })).toHaveAttribute('href', '/projects/1/board');
  });

  it('shows an analytics loading state until the response arrives', async () => {
    const pending = deferred();
    getSprintAnalytics.mockReturnValue(pending.promise);
    renderPage();
    expect(await screen.findByText('Loading Sprint analytics...')).toBeInTheDocument();
    await act(async () => { pending.resolve(data); });
    expect(screen.getByRole('heading', { name: 'Recorded Actual Hours' })).toBeInTheDocument();
  });

  it('selects a bookmarked responsible project', async () => {
    renderPage('/analytics/sprints?project=2');
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
    expect(getSprintAnalytics).toHaveBeenCalledWith('2', 'admin-token');
    expect(screen.getByLabelText('Project')).toHaveValue('2');
  });

  it('never requests an unlisted project from a tampered URL', async () => {
    renderPage('/analytics/sprints?project=99');
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
    expect(getSprintAnalytics).toHaveBeenCalledTimes(1);
    expect(getSprintAnalytics).toHaveBeenCalledWith('1', 'admin-token');
  });

  it('switches projects and does not leave the old chart visible while loading', async () => {
    const pending = deferred();
    getSprintAnalytics.mockResolvedValueOnce(data).mockReturnValueOnce(pending.promise);
    renderPage();
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '2' } });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Loading Sprint analytics...')).toBeInTheDocument();
    await act(async () => { pending.resolve(empty); });
    expect(screen.getByText('No Sprints in this project yet.')).toBeInTheDocument();
  });

  it('ignores a slow response from the previous project', async () => {
    const pending = deferred();
    getSprintAnalytics.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty);
    renderPage();
    await screen.findByLabelText('Project');
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '2' } });
    await screen.findByText('No Sprints in this project yet.');
    await act(async () => { pending.resolve(data); });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No Sprints in this project yet.')).toBeInTheDocument();
  });

  it('handles admins without responsible projects without fetching analytics', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });
    renderPage();
    expect(await screen.findByText('No responsible projects yet.')).toBeInTheDocument();
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it('handles empty Sprints without inventing developer data', async () => {
    getSprintAnalytics.mockResolvedValue({ ...empty, sprints: data.sprints });
    renderPage();
    expect(await screen.findByText('No developer Actual Hours recorded for these Sprints yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('reports incomplete totals and unallocated work separately', async () => {
    getSprintAnalytics.mockResolvedValue({ ...data,
      effort: [{ ...data.effort[0], missing_actual_hours: 1 }],
      unattributed: [{ sprint_id: '10', actual_hours: 6.5, recorded_items: 1, missing_actual_hours: 0 },
        { sprint_id: null, actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 }]
    });
    renderPage();
    expect(await screen.findByText(/Totals are incomplete/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unattributed work' })).toBeInTheDocument();
    expect(screen.getByText('6.5 h')).toBeInTheDocument();
    expect(screen.getByText('No Sprint recorded')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('allows retrying an analytics failure', async () => {
    getSprintAnalytics.mockRejectedValueOnce(new Error('Analytics unavailable')).mockResolvedValueOnce(data);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
    expect(getSprintAnalytics).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a project-list failure', async () => {
    getResponsibleProjects.mockRejectedValueOnce(new Error('Projects unavailable')).mockResolvedValueOnce({ projects });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Projects unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
  });

  it('shows Access Denied instead of a chart or retry when analytics access is refused', async () => {
    getSprintAnalytics.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('does not fetch analytics when the admin project list is forbidden', async () => {
    getResponsibleProjects.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    renderPage();
    await screen.findByRole('heading', { name: 'Access Denied' });
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });
});
