import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getBoard,
  getProjectMembers,
  updateProject,
  deleteProject
} from '../services/api.js';

// US-04c Stage 5: deleting the board (its project) from the board's title bar.
// Kept in its own file, apart from Board.test.jsx, Board.admin.test.jsx (US-04a)
// and Board.rename.test.jsx (Stage 4).
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

// The board, plus a stand-in dashboard so navigation after a delete is visible.
function renderBoard(path = '/projects/7/board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function boardNamed(name) {
  return {
    project: { id: 7, name },
    sprints: [],
    pbis: [
      {
        id: 2,
        title: 'Upload photo',
        stage: 'active_sprint',
        tasks: [
          {
            id: 9,
            title: 'Build upload endpoint',
            status: 'todo',
            assignee_id: null,
            subTasks: [{ id: 20, title: 'Validate file type', status: 'todo', assignee_id: null }]
          }
        ]
      }
    ]
  };
}

const admin = { id: 3, name: 'Admin', role: 'admin', token: 'admin-tok' };
const developer = { id: 2, name: 'Developer', role: 'developer', token: 'dev-tok' };

async function openBoard(user) {
  useAuth.mockReturnValue({ user });
  renderBoard();
  await waitFor(() => expect(screen.getByText('BIX Platform')).toBeInTheDocument());
}

// The title bar's "Delete board" button (task/sub-task rows have their own "Delete").
const titleDeleteButton = () => screen.getByRole('button', { name: 'Delete board' });

describe('Board page - delete the board (US-04c)', () => {
  let confirmSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmSpy = vi.spyOn(window, 'confirm');
    getProjectMembers.mockResolvedValue({ members: [] });
    getBoard.mockResolvedValue(boardNamed('BIX Platform'));
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('shows Delete board next to Rename for an Admin', async () => {
    await openBoard(admin);

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(titleDeleteButton()).toBeInTheDocument();
    // The task and sub-task rows keep their own Delete buttons (US-04a).
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('shows no Delete board (and no Rename) for a Developer', async () => {
    await openBoard(developer);

    expect(screen.queryByRole('button', { name: 'Delete board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('asks for confirmation and makes no request when it is cancelled', async () => {
    await openBoard(admin);
    confirmSpy.mockReturnValue(false);

    fireEvent.click(titleDeleteButton());

    expect(confirmSpy).toHaveBeenCalledWith('Delete "BIX Platform"? This cannot be undone.');
    expect(deleteProject).not.toHaveBeenCalled();
    expect(screen.getByText('BIX Platform')).toBeInTheDocument();
  });

  it('deletes after confirmation and goes to the dashboard', async () => {
    await openBoard(admin);
    confirmSpy.mockReturnValue(true);
    deleteProject.mockResolvedValue({ message: 'Project deleted', id: 7 });

    fireEvent.click(titleDeleteButton());

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(deleteProject).toHaveBeenCalledWith('7', 'admin-tok');
  });

  it('shows the exact 409 message and stays on the board when it still has work', async () => {
    await openBoard(admin);
    confirmSpy.mockReturnValue(true);
    deleteProject.mockRejectedValue(
      new Error('This board still has work (PBIs or sprints) and cannot be deleted')
    );

    fireEvent.click(titleDeleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This board still has work (PBIs or sprints) and cannot be deleted'
    );
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
    expect(screen.getByText('BIX Platform')).toBeInTheDocument();
    // Can try again.
    expect(titleDeleteButton()).toBeEnabled();
  });

  it('shows an error and stays on the board when the delete fails for another reason', async () => {
    await openBoard(admin);
    confirmSpy.mockReturnValue(true);
    deleteProject.mockRejectedValue(new Error('Failed to delete the project'));

    fireEvent.click(titleDeleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete the project');
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
    expect(titleDeleteButton()).toBeEnabled();
  });

  it('hides Delete board while renaming, and brings it back on Cancel', async () => {
    await openBoard(admin);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.queryByRole('button', { name: 'Delete board' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(titleDeleteButton()).toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('still renames the board', async () => {
    await openBoard(admin);
    updateProject.mockResolvedValue({ project: { id: 7, name: 'BIX Platform v2' } });
    getBoard.mockResolvedValue(boardNamed('BIX Platform v2'));

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'BIX Platform v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('BIX Platform v2')).toBeInTheDocument());
    expect(updateProject).toHaveBeenCalledWith('7', 'BIX Platform v2', 'admin-tok');
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('leaves the task Edit/Delete controls and Complete PBI in place', async () => {
    await openBoard(admin);

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Complete PBI' })).toBeInTheDocument();
    expect(screen.getByText('Build upload endpoint')).toBeInTheDocument();
    expect(screen.getByText('Validate file type')).toBeInTheDocument();
  });
});
