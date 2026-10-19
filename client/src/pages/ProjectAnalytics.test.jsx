import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectAnalytics from './ProjectAnalytics.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectAnalytics } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getProjectAnalytics: vi.fn() }));
vi.mock('../components/dashboard/AdminSidebar.jsx', () => ({ default: () => <aside>Admin navigation</aside> }));

const data = {
  projects: [{ id: '1', name: 'Platform' }, { id: '2', name: 'Mobile' }],
  developers: [{ id: '7', name: 'Alex' }],
  effort: [{ project_id: '1', developer_id: '7', actual_hours: 3.25, recorded_items: 2, missing_actual_hours: 0 },
    { project_id: '2', developer_id: '7', actual_hours: 5, recorded_items: 1, missing_actual_hours: 0 }],
  unattributed: []
};
const empty = { projects: [], developers: [], effort: [], unattributed: [] };
const page = () => <MemoryRouter><ProjectAnalytics /></MemoryRouter>;

describe('ProjectAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: '3', role: 'admin', token: 'admin-token' } });
    getProjectAnalytics.mockResolvedValue(data);
  });

  it('loads authorized project comparisons with the login token and labels totals accurately', async () => {
    render(page());
    expect(screen.getByRole('status')).toHaveTextContent('Loading Project analytics...');
    expect(await screen.findByRole('img', { name: 'Alex (#7), Platform (#1): 3.25 actual hours' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Alex (#7), Mobile (#2): 5 actual hours' })).toBeInTheDocument();
    expect(getProjectAnalytics).toHaveBeenCalledWith('admin-token');
    expect(screen.getByText('2 projects / 1 developers')).toBeInTheDocument();
    expect(screen.queryByText(/average/i)).not.toBeInTheDocument();
  });

  it('handles an admin without responsible projects', async () => {
    getProjectAnalytics.mockResolvedValue(empty);
    render(page());
    expect(await screen.findByText('No responsible projects yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps projects without recorded developer hours visible in the empty state', async () => {
    getProjectAnalytics.mockResolvedValue({ ...empty, projects: data.projects });
    render(page());
    expect(await screen.findByText('No developer Actual Hours recorded for these projects yet.')).toBeInTheDocument();
    expect(screen.getByText('2 projects / 0 developers')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('retains incomplete records instead of presenting missing values as complete totals', async () => {
    getProjectAnalytics.mockResolvedValue({ ...data,
      effort: [{ ...data.effort[0], actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 }]
    });
    render(page());
    expect(await screen.findByText(/Totals are incomplete/)).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('reports unallocated work per project without adding it to a developer chart', async () => {
    getProjectAnalytics.mockResolvedValue({ ...data, unattributed: [
      { project_id: '1', actual_hours: 4.5, recorded_items: 1, missing_actual_hours: 0 },
      { project_id: '2', actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 }
    ] });
    render(page());
    expect(await screen.findByRole('heading', { name: 'Unattributed work' })).toBeInTheDocument();
    expect(screen.getByText('Platform (#1)')).toBeInTheDocument();
    expect(screen.getByText('4.5 h')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Alex (#7), Platform (#1): 3.25 actual hours' })).toBeInTheDocument();
  });

  it('retries a failed request and recovers the real view', async () => {
    getProjectAnalytics.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(data);
    render(page());
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Recorded Actual Hours' });
    expect(getProjectAnalytics).toHaveBeenCalledTimes(2);
  });

  it('renders Access Denied for a forbidden request, without charts or pointless retries', async () => {
    getProjectAnalytics.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    render(page());
    await screen.findByRole('heading', { name: 'Access Denied' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('ignores an obsolete response after the authenticated account changes', async () => {
    let resolve;
    getProjectAnalytics.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(empty);
    const view = render(page());
    useAuth.mockReturnValue({ user: { id: '9', role: 'admin', token: 'other-token' } });
    view.rerender(page());
    await screen.findByText('No responsible projects yet.');
    await act(async () => { resolve(data); });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(getProjectAnalytics).toHaveBeenLastCalledWith('other-token');
  });
});
