import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard, getProjectMembers, updateProject } from '../services/api.js';

// US-04c Stage 4: renaming the board (its project) from the board's title bar.
// Kept in its own file, apart from Board.test.jsx (developer / workflow
// flows) and Board.admin.test.jsx (US-04a task controls).
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

function renderBoard(path = '/projects/7/board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
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

describe('Board page - rename the board (US-04c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectMembers.mockResolvedValue({ members: [] });
    getBoard.mockResolvedValue(boardNamed('BIX Platform'));
  });

  it('shows a Rename button next to the board name for an Admin', async () => {
    await openBoard(admin);

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('shows the board name with no Rename button for a Developer', async () => {
    await openBoard(developer);

    expect(screen.getByText('BIX Platform')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('enters edit mode with the current name filled in', async () => {
    await openBoard(admin);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByLabelText('Project name')).toHaveValue('BIX Platform');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('saves the trimmed name and shows the name from the refreshed board', async () => {
    await openBoard(admin);
    updateProject.mockResolvedValue({ project: { id: 7, name: 'BIX Platform v2' } });
    getBoard.mockResolvedValue(boardNamed('BIX Platform v2'));

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '  BIX Platform v2  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('BIX Platform v2')).toBeInTheDocument());
    expect(updateProject).toHaveBeenCalledWith('7', 'BIX Platform v2', 'admin-tok');
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('rejects a blank name without calling the API', async () => {
    await openBoard(admin);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A project name is required');
    expect(updateProject).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
  });

  it('keeps the form open and shows the backend error when the rename is rejected', async () => {
    await openBoard(admin);
    updateProject.mockRejectedValue(new Error('You are not responsible for this project'));

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Another name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not responsible for this project'
    );
    expect(screen.getByLabelText('Project name')).toHaveValue('Another name');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Cancel makes no API call and restores the normal title', async () => {
    await openBoard(admin);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateProject).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
    expect(screen.getByText('BIX Platform')).toBeInTheDocument();
  });

  it('leaves the task controls and completion controls on the board in place', async () => {
    await openBoard(admin);

    const taskControlsBefore = {
      edit: screen.getAllByRole('button', { name: 'Edit' }).length,
      del: screen.getAllByRole('button', { name: 'Delete' }).length
    };
    expect(taskControlsBefore).toEqual({ edit: 2, del: 2 });
    expect(screen.getByRole('button', { name: 'Complete PBI' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    // Opening the rename form changes only the title bar.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Complete PBI' })).toBeInTheDocument();
    expect(screen.getByText('Build upload endpoint')).toBeInTheDocument();
    expect(screen.getByText('Validate file type')).toBeInTheDocument();
  });
});
