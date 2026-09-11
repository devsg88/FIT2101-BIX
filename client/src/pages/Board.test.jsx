import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getBoard: vi.fn() }));

function renderBoard(path = '/projects/7/board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Board page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
  });

  it('shows a loading state, then the four stage columns', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: []
    });

    renderBoard();

    expect(screen.getByText('Loading board...')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText('BIX Platform')).toBeInTheDocument()
    );

    for (const label of [
      'Product Backlog',
      'Sprint Planning',
      'Active Sprint',
      'Completed'
    ]) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    }
  });

  it('passes the route projectId and token to getBoard', async () => {
    getBoard.mockResolvedValue({ project: { id: 7, name: 'X' }, sprints: [], pbis: [] });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(getBoard).toHaveBeenCalledWith('7', 'tok'));
  });

  it('places each PBI in the column matching its stage', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] },
        {
          id: 2,
          title: 'Upload photo',
          stage: 'sprint_planning',
          tasks: [{ id: 9, title: 'Build upload endpoint', status: 'todo', subTasks: [] }]
        }
      ]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    const planningColumn = screen
      .getByRole('heading', { name: 'Sprint Planning' })
      .closest('section');
    expect(planningColumn).toHaveTextContent('Upload photo');
    expect(planningColumn).toHaveTextContent('Build upload endpoint');
  });

  it('shows a PBI\'s task titles, and its sub-task titles nested under them', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 2,
          title: 'Upload photo',
          stage: 'sprint_planning',
          estimated_hours: '16.00',
          planned_start_date: '2026-09-15',
          planned_end_date: '2026-09-22',
          tasks: [
            {
              id: 1,
              title: 'Build the upload API endpoint',
              status: 'todo',
              subTasks: [
                { id: 1, title: 'Validate file size and type', status: 'done' }
              ]
            }
          ]
        }
      ]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());

    expect(screen.getByText('Build the upload API endpoint')).toBeInTheDocument();
    expect(screen.getByText('Validate file size and type')).toBeInTheDocument();
    expect(screen.getByText('Est: 16h | Sep 15 - Sep 22')).toBeInTheDocument();

    // The sub-task is marked done, the task is not, the checkboxes should
    // reflect that (and never be interactive, there is no toggle feature yet).
    const [taskCheckbox, subTaskCheckbox] = screen.getAllByRole('checkbox');
    expect(taskCheckbox).not.toBeChecked();
    expect(taskCheckbox).toBeDisabled();
    expect(subTaskCheckbox).toBeChecked();
    expect(subTaskCheckbox).toBeDisabled();
  });

  it('shows "Status: Unestimated" for a PBI with no planning info yet', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }
      ]
    });

    renderBoard();

    await waitFor(() =>
      expect(screen.getByText('Status: Unestimated')).toBeInTheDocument()
    );
  });

  it('shows an error state with a retry button when the load fails', async () => {
    getBoard.mockRejectedValue(new Error('Failed to load the project board'));

    renderBoard();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Failed to load the project board/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
