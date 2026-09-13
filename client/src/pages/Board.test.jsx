import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard, movePbi } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getBoard: vi.fn(), movePbi: vi.fn() }));

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

  it('offers "Move to Sprint Planning" only on a Product Backlog card', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] },
        { id: 2, title: 'Upload photo', stage: 'sprint_planning', tasks: [] }
      ]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    // Exactly one button: the Product Backlog card's, not the Sprint
    // Planning card's, matching what the backend's transition map allows.
    expect(
      screen.getAllByRole('button', { name: /Move to Sprint Planning/ })
    ).toHaveLength(1);
  });

  it('does not offer the move action on cards already past Product Backlog', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        { id: 1, title: 'In planning', stage: 'sprint_planning', tasks: [] },
        { id: 2, title: 'In progress', stage: 'active_sprint', tasks: [] },
        { id: 3, title: 'Done already', stage: 'completed', tasks: [] }
      ]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('In planning')).toBeInTheDocument());

    // None of the three, whichever later stage they are in, offer a way
    // back into (or "into", for the already-planning one) Sprint Planning.
    expect(
      screen.queryByRole('button', { name: /Move to Sprint Planning/ })
    ).not.toBeInTheDocument();
  });

  it('moves only the selected PBI, a sibling Product Backlog item is left alone', async () => {
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [
          { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] },
          { id: 5, title: 'Onboarding flow', stage: 'product_backlog', tasks: [] }
        ]
      })
      // The refreshed board after the move: fetched fresh from the server,
      // this is what the columns must end up matching, not a local guess.
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [
          { id: 1, title: 'Reset password', stage: 'sprint_planning', tasks: [] },
          { id: 5, title: 'Onboarding flow', stage: 'product_backlog', tasks: [] }
        ]
      });
    movePbi.mockResolvedValue({ pbi: { id: 1, stage: 'sprint_planning' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    // Two Product Backlog cards, two buttons; click the first PBI's.
    const [firstButton] = screen.getAllByRole('button', {
      name: /Move to Sprint Planning/
    });
    fireEvent.click(firstButton);

    // Only PBI 1 was requested to move, never PBI 5.
    expect(movePbi).toHaveBeenCalledTimes(1);
    expect(movePbi).toHaveBeenCalledWith('7', 1, 'sprint_planning', 'tok');

    await waitFor(() => {
      const planningColumn = screen
        .getByRole('heading', { name: 'Sprint Planning' })
        .closest('section');
      expect(planningColumn).toHaveTextContent('Reset password');
    });

    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).not.toHaveTextContent('Reset password');
    expect(backlogColumn).toHaveTextContent('Onboarding flow');
  });

  it('re-fetches the board after a successful move and shows the moved PBI from that fresh data', async () => {
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'sprint_planning', tasks: [] }]
      });
    movePbi.mockResolvedValue({ pbi: { id: 1, stage: 'sprint_planning' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    expect(movePbi).toHaveBeenCalledWith('7', 1, 'sprint_planning', 'tok');

    // The board asked the server for a fresh copy after the move succeeded,
    // it did not just trust a locally patched guess.
    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      const planningColumn = screen
        .getByRole('heading', { name: 'Sprint Planning' })
        .closest('section');
      expect(planningColumn).toHaveTextContent('Reset password');
    });

    // It also left the Product Backlog column, there is only one copy of the
    // card, this is a move, not a duplicate.
    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).not.toHaveTextContent('Reset password');
  });

  it('shows whatever the refreshed board says, even if that disagreed with the move response', async () => {
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
      })
      // The application's current board data, the source of truth: PBI 1 is
      // in Sprint Planning here.
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'sprint_planning', tasks: [] }]
      });
    // Deliberately inconsistent with the refreshed board above, to prove the
    // UI does not just trust this response and skip the refresh.
    movePbi.mockResolvedValue({ pbi: { id: 1, stage: 'active_sprint' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() => {
      const planningColumn = screen
        .getByRole('heading', { name: 'Sprint Planning' })
        .closest('section');
      expect(planningColumn).toHaveTextContent('Reset password');
    });

    const activeSprintColumn = screen
      .getByRole('heading', { name: 'Active Sprint' })
      .closest('section');
    expect(activeSprintColumn).not.toHaveTextContent('Reset password');
  });

  it('reports a refresh failure separately from a move failure', async () => {
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
      })
      // The move itself succeeds (movePbi below resolves), but refreshing
      // the board afterward fails.
      .mockRejectedValueOnce(new Error('network blip'));
    movePbi.mockResolvedValue({ pbi: { id: 1, stage: 'sprint_planning' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The move was saved, but the board could not be refreshed: network blip'
      )
    );
  });

  it('shows an error and leaves the card in place when the move is rejected', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    movePbi.mockRejectedValue(new Error('Cannot move a PBI from "product_backlog" to "sprint_planning"'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot move a PBI from "product_backlog" to "sprint_planning"'
      )
    );

    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).toHaveTextContent('Reset password');
  });

  it('shows a visible error and keeps the PBI put when the move is refused for an access reason', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    // Matches what requireAuth / a future permission check would send back.
    movePbi.mockRejectedValue(new Error('Invalid or expired token'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid or expired token')
    );

    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).toHaveTextContent('Reset password');
  });

  it('shows a visible error and keeps the PBI put on a general request failure (e.g. the network, or a 500)', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    // A raw fetch/network failure, not an HTTP error response at all.
    movePbi.mockRejectedValue(new TypeError('Failed to fetch'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch')
    );

    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).toHaveTextContent('Reset password');
  });

  it('never fails silently, even if something threw without a usable message', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    // Deliberately not a real Error, to prove the fallback message kicks in
    // rather than the error box just staying empty/absent.
    movePbi.mockRejectedValue({});

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong moving this item. Please try again.'
      )
    );

    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).toHaveTextContent('Reset password');
  });
});
