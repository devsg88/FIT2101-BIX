import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getBoard,
  movePbi,
  startSprint,
  updatePbiPlanning, 
  getCompletedWork, 
  completeTask, 
  completeSubTask, 
  completePbi
} from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

// Registers both routes App.jsx does for the board, since the Completed Work
// History sidebar (US-12) is reached by navigating between them, not by a
// separate page - see Board.jsx's BoardView (isHistoryOpen).
function renderBoard(path = '/projects/7/board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
        <Route path="/projects/:projectId/completed-work" element={<Board />} />
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

  // NFR-01: a Developer who types/bookmarks a URL for a project they are
  // not assigned to (or an Admin not responsible for it) gets this 403 from
  // the backend on the very first load - shown as Access Denied, not the
  // generic "Couldn't load the board" / Retry treatment above.
  it('shows Access Denied, not the generic error/Retry, when the board load is forbidden', async () => {
    const forbidden = new Error('You are not a member of this project');
    forbidden.status = 403;
    getBoard.mockRejectedValue(forbidden);

    renderBoard();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText(/You are not a member of this project/)).not.toBeInTheDocument();
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

  it('moves the card to Sprint Planning after a successful move, using the server-confirmed stage', async () => {
    const pbi = { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] };
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [pbi]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ ...pbi, stage: 'sprint_planning' }]
      });
    movePbi.mockResolvedValue({
      pbi: { id: 1, title: 'Reset password', stage: 'sprint_planning' }
    });

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

  // NFR-01 / BoardContext.jsx: movePbiStage wraps a failed post-move refresh
  // in a brand-new Error - this proves that wrapping still carries the
  // original err.status (e.g. 403) across, so this rare case (access was
  // revoked between the move succeeding and the refresh running) still
  // renders with the forbidden styling instead of silently losing it.
  it('keeps the forbidden styling even when a 403 hits the post-move refresh, not the move itself', async () => {
    const forbiddenRefresh = new Error('You are not a member of this project');
    forbiddenRefresh.status = 403;
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
      })
      .mockRejectedValueOnce(forbiddenRefresh);
    movePbi.mockResolvedValue({ pbi: { id: 1, stage: 'sprint_planning' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The move was saved, but the board could not be refreshed: You are not a member of this project'
    );
    expect(alert.className).toContain('--forbidden');
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

  // NFR-01: an action-level 403 (e.g. a Developer's stale UI still showing
  // a move/delete/edit control the backend will now refuse) stays right on
  // the card as an inline error - never a full-page redirect, unlike a
  // page-level 403 (see the earlier "forbidden" board-load test above).
  it('shows a distinct permission-denied style for a 403 on an action, not the plain error style', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    const forbidden = new Error('You do not have permission to perform this action');
    forbidden.status = 403;
    movePbi.mockRejectedValue(forbidden);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Move to Sprint Planning/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have permission to perform this action');
    expect(alert.className).toContain('--forbidden');

    // Still stays on the board - no navigation away, same as any other
    // action-level error.
    const backlogColumn = screen
      .getByRole('heading', { name: 'Product Backlog' })
      .closest('section');
    expect(backlogColumn).toHaveTextContent('Reset password');
  });

  it('saves estimate and dates for a Sprint Planning card', async () => {
    const planningPbi = {
      id: 2,
      title: 'Upload photo',
      stage: 'sprint_planning',
      tasks: []
    };
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
        pbis: [planningPbi]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
        pbis: [{
          ...planningPbi,
          estimated_hours: '12.00',
          planned_start_date: '2026-10-20',
          planned_end_date: '2026-10-24'
        }]
      });
    updatePbiPlanning.mockResolvedValue({ pbi: { id: 2 } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Story points / hours'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save estimate' }));

    await waitFor(() =>
      expect(updatePbiPlanning).toHaveBeenCalledWith(
        '7',
        2,
        {
          planned_start_date: '2026-10-20',
          planned_end_date: '2026-10-24',
          estimated_hours: 12
        },
        'tok'
      )
    );

    await waitFor(() =>
      expect(screen.getByText('Est: 12h | Oct 20 - Oct 24')).toBeInTheDocument()
    );
  });

  it('moves Sprint Planning items into Active Sprint after Start Sprint', async () => {
    const plannedPbi = {
      id: 2,
      title: 'Upload photo',
      stage: 'sprint_planning',
      estimated_hours: '16.00',
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      tasks: []
    };
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
        pbis: [plannedPbi]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [{ id: 3, name: 'Sprint 3', status: 'active' }],
        pbis: [{ ...plannedPbi, stage: 'active_sprint' }]
      });
    startSprint.mockResolvedValue({ sprint: { id: 3, status: 'active' }, pbis: [] });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start Sprint' }));

    expect(startSprint).toHaveBeenCalledWith('7', 3, 'tok');

    await waitFor(() => {
      const activeColumn = screen
        .getByRole('heading', { name: 'Active Sprint' })
        .closest('section');
      expect(activeColumn).toHaveTextContent('Upload photo');
    });

    const planningColumn = screen
      .getByRole('heading', { name: 'Sprint Planning' })
      .closest('section');
    expect(planningColumn).not.toHaveTextContent('Upload photo');
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

  describe('Completed Work History sidebar (US-12)', () => {
    beforeEach(() => {
      getBoard.mockResolvedValue({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: []
      });
    });

    it('is closed on the plain board route, and opens the completed-work route when clicked', async () => {
      getCompletedWork.mockResolvedValue({ project: { id: 7, name: 'BIX Platform' }, pbis: [] });

      renderBoard('/projects/7/board');

      await waitFor(() => expect(screen.getByText('BIX Platform')).toBeInTheDocument());
      expect(screen.queryByRole('dialog', { name: 'Completed work history' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Work History/ }));

      await waitFor(() =>
        expect(screen.getByRole('dialog', { name: 'Completed work history' })).toBeInTheDocument()
      );
    });

    it('shows task name, Sprint, completion date, effort and collaborators for a completed PBI, and keeps its tasks/sub-tasks nested', async () => {
      getCompletedWork.mockResolvedValue({
        project: { id: 7, name: 'BIX Platform' },
        pbis: [
          {
            id: 4,
            title: 'Login page',
            stage: 'completed',
            sprint_name: 'Sprint 1',
            actual_hours: '10.50',
            updated_at: '2026-08-07T16:00:00.000Z',
            collaborators: [{ id: 2, name: 'Pang', email: 'pang@bix.app', role: 'developer' }],
            tasks: [
              {
                id: 5,
                title: 'Wire the form to the auth API',
                status: 'done',
                subTasks: []
              }
            ]
          }
        ]
      });

      renderBoard('/projects/7/completed-work');

      await waitFor(() => expect(getCompletedWork).toHaveBeenCalledWith('7', 'tok'));
      const item = screen.getByRole('heading', { name: 'Login page' }).closest('li');
      expect(item).toHaveTextContent('Sprint');
      expect(item).toHaveTextContent('Sprint 1');
      expect(item).toHaveTextContent('Completed');
      expect(item).toHaveTextContent('Aug 7');
      expect(item).toHaveTextContent('Effort');
      expect(item).toHaveTextContent('10.5h');
      expect(item).toHaveTextContent('Collaborators');
      expect(item).toHaveTextContent('Pang');
      expect(item).toHaveTextContent('Wire the form to the auth API');
    });

    it('shows "Not recorded" for Sprint and Effort, and "No collaborators recorded" for Collaborators, when that data has not been captured', async () => {
      getCompletedWork.mockResolvedValue({
        project: { id: 7, name: 'BIX Platform' },
        pbis: [
          {
            id: 4,
            title: 'Login page',
            stage: 'completed',
            sprint_name: null,
            actual_hours: null,
            updated_at: null,
            collaborators: [],
            tasks: []
          }
        ]
      });

      renderBoard('/projects/7/completed-work');

      const item = await waitFor(() =>
        screen.getByRole('heading', { name: 'Login page' }).closest('li')
      );
      // Three distinct fields, all missing for different reasons (no sprint
      // link, US-11 has not recorded hours, no updated_at) - all read the
      // same "Not recorded" rather than a blank or a misleading default.
      expect(item.textContent.match(/Not recorded/g)).toHaveLength(3);
      // Collaborators gets its own wording, consistent with "Not recorded"
      // but distinct since "nobody recorded" is a different kind of absence
      // than "the hours weren't logged".
      expect(item).toHaveTextContent('No collaborators recorded');
    });

    it('lists every collaborator, comma-separated, when more than one worked on a completed PBI', async () => {
      getCompletedWork.mockResolvedValue({
        project: { id: 7, name: 'BIX Platform' },
        pbis: [
          {
            id: 4,
            title: 'Login page',
            stage: 'completed',
            sprint_name: 'Sprint 1',
            actual_hours: '10.50',
            updated_at: '2026-08-07T16:00:00.000Z',
            collaborators: [
              { id: 2, name: 'Pang', email: 'pang@bix.app', role: 'developer' },
              { id: 3, name: 'Dave', email: 'dev@bix.local', role: 'developer' },
              { id: 1, name: 'Admin', email: 'admin@bix.app', role: 'admin' }
            ],
            tasks: []
          }
        ]
      });

      renderBoard('/projects/7/completed-work');

      const item = await waitFor(() =>
        screen.getByRole('heading', { name: 'Login page' }).closest('li')
      );
      expect(item).toHaveTextContent('Collaborators');
      expect(item).toHaveTextContent('Pang, Dave, Admin');
    });

    it('distinguishes multiple completed records, each showing its own Sprint/date/effort', async () => {
      getCompletedWork.mockResolvedValue({
        project: { id: 7, name: 'BIX Platform' },
        pbis: [
          {
            id: 4,
            title: 'Login page',
            stage: 'completed',
            sprint_name: 'Sprint 1',
            actual_hours: '10.50',
            updated_at: '2026-08-07T16:00:00.000Z',
            tasks: []
          },
          {
            id: 6,
            title: 'Password reset flow',
            stage: 'completed',
            sprint_name: 'Sprint 2',
            actual_hours: '4.00',
            updated_at: '2026-08-20T09:00:00.000Z',
            tasks: []
          }
        ]
      });

      renderBoard('/projects/7/completed-work');

      const firstItem = await waitFor(() =>
        screen.getByRole('heading', { name: 'Login page' }).closest('li')
      );
      const secondItem = screen.getByRole('heading', { name: 'Password reset flow' }).closest('li');

      expect(firstItem).toHaveTextContent('Sprint 1');
      expect(firstItem).toHaveTextContent('10.5h');
      expect(secondItem).toHaveTextContent('Sprint 2');
      expect(secondItem).toHaveTextContent('4h');
      // Each record's fields stay with its own card, not mixed into the other's.
      expect(firstItem).not.toHaveTextContent('Sprint 2');
      expect(secondItem).not.toHaveTextContent('Sprint 1');
    });

    it('shows a dedicated access-denied message on a 403, not the generic error state', async () => {
      const forbidden = new Error("You do not have permission to view this project's completed work");
      forbidden.status = 403;
      getCompletedWork.mockRejectedValue(forbidden);

      renderBoard('/projects/7/completed-work');

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText(/don.t have permission to view this project/)).toBeInTheDocument();
      // Not the generic "Couldn't load" / Retry treatment a plain failure gets.
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('shows a generic error with a Retry button on a non-403 failure', async () => {
      getCompletedWork.mockRejectedValue(new Error('Failed to load completed work history'));

      renderBoard('/projects/7/completed-work');

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText(/Failed to load completed work history/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('shows an empty message rather than an error when nothing has been completed yet', async () => {
      getCompletedWork.mockResolvedValue({ project: { id: 7, name: 'BIX Platform' }, pbis: [] });

      renderBoard('/projects/7/completed-work');

      await waitFor(() =>
        expect(screen.getByText('Nothing has been completed on this project yet.')).toBeInTheDocument()
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('closes the sidebar and returns to the board when the close button is clicked', async () => {
      getCompletedWork.mockResolvedValue({ project: { id: 7, name: 'BIX Platform' }, pbis: [] });

      renderBoard('/projects/7/completed-work');

      await waitFor(() =>
        expect(screen.getByRole('dialog', { name: 'Completed work history' })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole('button', { name: 'Close work history' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Completed work history' })).not.toBeInTheDocument()
      );
    });
  });

  it('lets the assigned developer complete a task with actual hours', async () => {
    const activePbi = {
      id: 3,
      title: 'Burndown chart',
      stage: 'active_sprint',
      estimated_hours: '24.00',
      planned_start_date: '2026-08-17',
      planned_end_date: '2026-08-28',
      tasks: [
        {
          id: 3,
          title: 'Aggregate remaining hours per day',
          status: 'in_progress',
          assignee_id: 1,
          actual_hours: null,
          subTasks: []
        }
      ]
    };
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [activePbi]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{
          ...activePbi,
          tasks: [{
            ...activePbi.tasks[0],
            status: 'done',
            actual_hours: '4.00'
          }]
        }]
      });
    completeTask.mockResolvedValue({ task: { id: 3, status: 'done' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Burndown chart')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Actual hours for Aggregate remaining hours per day'), {
      target: { value: '4' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete task' }));

    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('7', 3, 4, 'tok'));
    await waitFor(() => expect(screen.getByText('Logged: 4h')).toBeInTheDocument());
  });

  it('shows validation when actual hours are not positive', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{
        id: 3,
        title: 'Burndown chart',
        stage: 'active_sprint',
        tasks: [{
          id: 3,
          title: 'Aggregate remaining hours per day',
          status: 'in_progress',
          assignee_id: 1,
          subTasks: []
        }]
      }]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Burndown chart')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Actual hours for Aggregate remaining hours per day'), {
      target: { value: '0' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete task' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Actual hours must be greater than 0')
    );
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('moves a PBI with finished tasks into Completed', async () => {
    const donePbi = {
      id: 3,
      title: 'Burndown chart',
      stage: 'active_sprint',
      estimated_hours: '24.00',
      tasks: [{
        id: 3,
        title: 'Aggregate remaining hours per day',
        status: 'done',
        assignee_id: 1,
        actual_hours: '4.00',
        subTasks: []
      }]
    };
    getBoard
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [donePbi]
      })
      .mockResolvedValueOnce({
        project: { id: 7, name: 'BIX Platform' },
        sprints: [],
        pbis: [{ ...donePbi, stage: 'completed', actual_hours: '4.00' }]
      });
    completePbi.mockResolvedValue({ pbi: { id: 3, stage: 'completed' } });

    renderBoard('/projects/7/board');

    await waitFor(() => expect(screen.getByText('Burndown chart')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Complete PBI' }));

    await waitFor(() => expect(completePbi).toHaveBeenCalledWith('7', 3, {}, 'tok'));
    await waitFor(() => {
      const completedColumn = screen
        .getByRole('heading', { name: 'Completed' })
        .closest('section');
      expect(completedColumn).toHaveTextContent('Burndown chart');
      expect(completedColumn).toHaveTextContent('Logged: 4h');
    });
  });
});

describe('Board top bar: Manage backlog link (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoard.mockResolvedValue({ project: { id: 7, name: 'BIX Platform' }, sprints: [], pbis: [] });
  });

  it('shows Admins a link to the project backlog', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });

    renderBoard('/projects/7/board');

    await screen.findByText('BIX Platform');
    expect(screen.getByRole('link', { name: 'Manage backlog' })).toHaveAttribute(
      'href',
      '/projects/7/backlog'
    );
  });

  it('does not show Developers the link', async () => {
    useAuth.mockReturnValue({ user: { id: 2, role: 'developer', token: 'tok' } });

    renderBoard('/projects/7/board');

    await screen.findByText('BIX Platform');
    expect(screen.queryByRole('link', { name: 'Manage backlog' })).not.toBeInTheDocument();
  });

  // Integration with US-04c: the top bar keeps <ProjectTitle /> (name,
  // Rename, Delete board), then the US-04b link, then the user controls.
  it('keeps ProjectTitle first, then Manage backlog, then the user, for an Admin', async () => {
    useAuth.mockReturnValue({ user: { id: 3, name: 'Admin', role: 'admin', token: 'tok' } });

    renderBoard('/projects/7/board');

    const name = await screen.findByText('BIX Platform');
    const rename = screen.getByRole('button', { name: 'Rename' });
    const deleteBoard = screen.getByRole('button', { name: 'Delete board' });
    const backlog = screen.getByRole('link', { name: 'Manage backlog' });
    const userName = screen.getByText('Admin');
    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(name, rename)).toBe(true);
    expect(follows(rename, deleteBoard)).toBe(true);
    expect(follows(deleteBoard, backlog)).toBe(true);
    expect(follows(backlog, userName)).toBe(true);
  });

  it('shows a Developer the board name but no Rename, Delete board or Manage backlog', async () => {
    useAuth.mockReturnValue({ user: { id: 2, name: 'Developer', role: 'developer', token: 'tok' } });

    renderBoard('/projects/7/board');

    await screen.findByText('BIX Platform');
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage backlog' })).not.toBeInTheDocument();
  });
});
