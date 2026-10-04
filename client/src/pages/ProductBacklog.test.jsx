import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductBacklog from './ProductBacklog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createPbi, deletePbi, getProjectPbis, updatePbi } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({
  getProjectPbis: vi.fn(),
  createPbi: vi.fn(),
  updatePbi: vi.fn(),
  deletePbi: vi.fn()
}));

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

describe('ProductBacklog page - create and edit (US-04b, SCRUM-101)', () => {
  const PBI = { id: 1, title: 'User can reset password', description: null, stage: 'product_backlog' };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', name: 'Admin', token: 'tok' } });
  });

  it('offers "+ New item" even when the backlog is empty', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [] });

    renderBacklog();

    await screen.findByText('This project has no Product Backlog Items yet.');
    fireEvent.click(screen.getByRole('button', { name: '+ New item' }));

    expect(screen.getByRole('heading', { name: 'New Backlog Item' })).toBeInTheDocument();
  });

  it('creates an item and shows it in the refreshed list', async () => {
    const created = { id: 2, title: 'Brand new item', stage: 'product_backlog' };
    getProjectPbis
      .mockResolvedValueOnce({ pbis: [PBI] })
      .mockResolvedValueOnce({ pbis: [PBI, created] });
    createPbi.mockResolvedValue({ pbi: created });

    renderBacklog('/projects/1/backlog');

    fireEvent.click(await screen.findByRole('button', { name: '+ New item' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand new item' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

    expect(await screen.findByText('Brand new item')).toBeInTheDocument();
    expect(createPbi).toHaveBeenCalledWith('1', { title: 'Brand new item' }, 'tok');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('opens the edit form pre-filled for that row, and shows the saved change', async () => {
    getProjectPbis
      .mockResolvedValueOnce({ pbis: [PBI] })
      .mockResolvedValueOnce({ pbis: [{ ...PBI, title: 'Reset password by email' }] });
    updatePbi.mockResolvedValue({ pbi: { ...PBI, title: 'Reset password by email' } });

    renderBacklog('/projects/1/backlog');

    fireEvent.click(await screen.findByRole('button', { name: 'Edit User can reset password' }));
    expect(screen.getByLabelText('Title')).toHaveValue('User can reset password');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reset password by email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Reset password by email')).toBeInTheDocument();
    expect(updatePbi).toHaveBeenCalledWith('1', 1, { title: 'Reset password by email' }, 'tok');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the form on Cancel without saving', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [PBI] });

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit User can reset password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updatePbi).not.toHaveBeenCalled();
  });
});

describe('ProductBacklog page - delete with confirmation (US-04b, SCRUM-102)', () => {
  const BACKLOG = { id: 1, title: 'User can reset password', stage: 'product_backlog' };
  const ACTIVE = { id: 3, title: 'Dashboard shows sprint burndown', stage: 'active_sprint' };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', name: 'Admin', token: 'tok' } });
  });

  it('asks "Are you sure?" before deleting, and deletes nothing on Cancel', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [BACKLOG] });

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete User can reset password' }));
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deletePbi).not.toHaveBeenCalled();
    expect(screen.getByText('User can reset password')).toBeInTheDocument();
  });

  it('removes the item from the refreshed list after a confirmed delete', async () => {
    getProjectPbis
      .mockResolvedValueOnce({ pbis: [BACKLOG] })
      .mockResolvedValueOnce({ pbis: [] });
    deletePbi.mockResolvedValue({ pbi: BACKLOG });

    renderBacklog('/projects/1/backlog');

    fireEvent.click(await screen.findByRole('button', { name: 'Delete User can reset password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText('This project has no Product Backlog Items yet.')
    ).toBeInTheDocument();
    expect(deletePbi).toHaveBeenCalledWith('1', 1, 'tok');
    expect(getProjectPbis).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('disables Delete for an item in the Active Sprint', async () => {
    getProjectPbis.mockResolvedValue({ pbis: [BACKLOG, ACTIVE] });

    renderBacklog();

    const activeDelete = await screen.findByRole('button', {
      name: 'Delete Dashboard shows sprint burndown'
    });
    expect(activeDelete).toBeDisabled();
    expect(activeDelete).toHaveAttribute('title', 'Items in the Active Sprint cannot be deleted');
    expect(screen.getByRole('button', { name: 'Delete User can reset password' })).toBeEnabled();
  });

  it('keeps the item and shows why when the server refuses the delete', async () => {
    const completed = { id: 4, title: 'Login page', stage: 'completed' };
    getProjectPbis.mockResolvedValue({ pbis: [completed] });
    deletePbi.mockRejectedValue(
      new Error('Cannot delete a PBI that still has tasks. Remove its tasks first.')
    );

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Login page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still has tasks');
    expect(getProjectPbis).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Login page').length).toBeGreaterThan(0);
  });
});
