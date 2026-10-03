import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductBacklog from './ProductBacklog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectPbis } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getProjectPbis: vi.fn() }));

function renderBacklog(path = '/projects/1/backlog') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/backlog" element={<ProductBacklog />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProductBacklog page (US-04b, SCRUM-151)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', name: 'Admin', token: 'tok' } });
  });

  it('calls the fetch endpoint with the route projectId and the token', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [] });

    renderBacklog('/projects/7/backlog');

    await waitFor(() => expect(getProjectPbis).toHaveBeenCalledWith('7', 'tok'));
  });

  it('shows a loading state, then each PBI with its title, priority and status', async () => {
    getProjectPbis.mockResolvedValue({
      pbis: [
        { id: 1, title: 'User can reset password', stage: 'product_backlog', priority: 'high' },
        { id: 2, title: 'User can upload a profile photo', stage: 'sprint_planning' },
        { id: 3, title: 'Dashboard shows sprint burndown', stage: 'active_sprint' },
        { id: 4, title: 'Login page', stage: 'completed' }
      ]
    });

    renderBacklog();

    expect(screen.getByText('Loading backlog...')).toBeInTheDocument();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(4);

    expect(within(rows[0]).getByText('User can reset password')).toBeInTheDocument();
    expect(within(rows[0]).getByText('High')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Product Backlog')).toBeInTheDocument();

    expect(within(rows[1]).getByText('Sprint Planning')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Active Sprint')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Completed')).toBeInTheDocument();
  });

  it('shows "Not set" for a PBI with no priority', async () => {
    getProjectPbis.mockResolvedValue({
      pbis: [{ id: 1, title: 'No priority yet', stage: 'product_backlog' }]
    });

    renderBacklog();

    const [row] = await screen.findAllByRole('listitem');
    expect(within(row).getByText('Not set')).toBeInTheDocument();
  });

  it('shows a friendly message when the project has no PBIs yet', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [] });

    renderBacklog();

    expect(
      await screen.findByText('This project has no Product Backlog Items yet.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it("shows the backend's message when the Admin is not responsible for the project", async () => {
    getProjectPbis.mockRejectedValue(new Error('You are not responsible for this project'));

    renderBacklog('/projects/2/backlog');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You are not responsible for this project');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('retries after a failed load', async () => {
    getProjectPbis
      .mockRejectedValueOnce(new Error('Failed to load the Product Backlog Items'))
      .mockResolvedValueOnce({ pbis: [{ id: 1, title: 'Back again', stage: 'product_backlog' }] });

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Back again')).toBeInTheDocument();
    expect(getProjectPbis).toHaveBeenCalledTimes(2);
  });

  it('links back to the project board', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [] });

    renderBacklog('/projects/7/backlog');

    expect(screen.getByRole('link', { name: 'Open board' })).toHaveAttribute(
      'href',
      '/projects/7/board'
    );
    await screen.findByText('This project has no Product Backlog Items yet.');
  });
});
