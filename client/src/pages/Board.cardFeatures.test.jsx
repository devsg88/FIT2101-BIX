import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard } from '../services/api.js';

// Three small board-readability features, kept in their own file rather
// than growing Board.test.jsx further (same reasoning Board.admin.test.jsx
// already gives for its own split): a task-count toggle per card, a "show
// only my cards" view filter, and an urgency badge derived from a PBI's
// real planned_end_date (there is no real priority field anywhere in this
// app yet, so this is not that).
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const YESTERDAY = isoDate(new Date(Date.now() - ONE_DAY_MS));
const TOMORROW = isoDate(new Date(Date.now() + ONE_DAY_MS));
const NEXT_MONTH = isoDate(new Date(Date.now() + 40 * ONE_DAY_MS));

describe('Task-count toggle on a PBI card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
  });

  it('shows how many tasks are done, and the checklist starts expanded', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 2,
          title: 'Upload photo',
          stage: 'sprint_planning',
          tasks: [
            { id: 1, title: 'Build the endpoint', status: 'done', subTasks: [] },
            { id: 2, title: 'Add the UI control', status: 'todo', subTasks: [] }
          ]
        }
      ]
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());

    expect(screen.getByText('1/2 tasks done')).toBeInTheDocument();
    // Expanded by default - both task titles already visible with no click.
    expect(screen.getByText('Build the endpoint')).toBeInTheDocument();
    expect(screen.getByText('Add the UI control')).toBeInTheDocument();
  });

  it('collapses and re-expands the checklist on click, without affecting the summary', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 2,
          title: 'Upload photo',
          stage: 'sprint_planning',
          tasks: [{ id: 1, title: 'Build the endpoint', status: 'todo', subTasks: [] }]
        }
      ]
    });

    renderBoard();
    await waitFor(() => expect(screen.getByText('Build the endpoint')).toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: /0\/1 tasks done/ });
    fireEvent.click(toggle);

    expect(screen.queryByText('Build the endpoint')).not.toBeInTheDocument();
    expect(screen.getByText('0/1 tasks done')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Build the endpoint')).toBeInTheDocument();
  });

  it('shows no toggle at all for a PBI with no tasks yet', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 2, title: 'Upload photo', stage: 'product_backlog', tasks: [] }]
    });

    renderBoard();
    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());

    expect(screen.queryByText(/tasks done/)).not.toBeInTheDocument();
  });
});

describe('"Show only my cards" filter', () => {
  const twoPbis = {
    project: { id: 7, name: 'BIX Platform' },
    sprints: [],
    pbis: [
      {
        id: 1,
        title: 'My card',
        stage: 'sprint_planning',
        tasks: [{ id: 10, title: 'Assigned to me', status: 'todo', assignee_id: 1, subTasks: [] }]
      },
      {
        id: 2,
        title: "Someone else's card",
        stage: 'sprint_planning',
        tasks: [{ id: 11, title: 'Assigned to them', status: 'todo', assignee_id: 2, subTasks: [] }]
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
  });

  it('shows every card by default, unchecked', async () => {
    getBoard.mockResolvedValue(twoPbis);
    renderBoard();

    await waitFor(() => expect(screen.getByText('My card')).toBeInTheDocument());

    expect(screen.getByText("Someone else's card")).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show only my cards' })).not.toBeChecked();
  });

  it('hides cards with no task assigned to the logged-in user once checked', async () => {
    getBoard.mockResolvedValue(twoPbis);
    renderBoard();

    await waitFor(() => expect(screen.getByText('My card')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only my cards' }));

    expect(screen.getByText('My card')).toBeInTheDocument();
    expect(screen.queryByText("Someone else's card")).not.toBeInTheDocument();
  });

  it('shows a "no cards assigned to you" message in a column that becomes empty', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [twoPbis.pbis[1]] // only the card assigned to someone else
    });
    renderBoard();

    await waitFor(() => expect(screen.getByText("Someone else's card")).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only my cards' }));

    expect(screen.queryByText("Someone else's card")).not.toBeInTheDocument();
    // Every column is empty once filtered here (only PBI was in Sprint
    // Planning), so scope to that column specifically rather than assuming
    // the message is unique on the page.
    const sprintPlanningColumn = screen
      .getByRole('heading', { name: 'Sprint Planning' })
      .closest('section');
    expect(sprintPlanningColumn).toHaveTextContent('No cards assigned to you here');
  });

  it('unchecking brings every card back', async () => {
    getBoard.mockResolvedValue(twoPbis);
    renderBoard();
    await waitFor(() => expect(screen.getByText('My card')).toBeInTheDocument());

    const toggle = screen.getByRole('checkbox', { name: 'Show only my cards' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.getByText('My card')).toBeInTheDocument();
    expect(screen.getByText("Someone else's card")).toBeInTheDocument();
  });

  it('also matches a sub-task assignment, not just a top-level task', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 3,
          title: 'Sub-task card',
          stage: 'sprint_planning',
          tasks: [
            {
              id: 20,
              title: 'Parent task',
              status: 'todo',
              assignee_id: null,
              subTasks: [{ id: 30, title: 'My sub-task', status: 'todo', assignee_id: 1 }]
            }
          ]
        }
      ]
    });
    renderBoard();
    await waitFor(() => expect(screen.getByText('Sub-task card')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only my cards' }));

    expect(screen.getByText('Sub-task card')).toBeInTheDocument();
  });
});

describe('Urgency badge on an Active Sprint card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
  });

  function activeSprintPbi(plannedEndDate) {
    return {
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 5,
          title: 'Ship the feature',
          stage: 'active_sprint',
          planned_end_date: plannedEndDate,
          tasks: []
        }
      ]
    };
  }

  it('shows "Overdue" when the planned end date has already passed', async () => {
    getBoard.mockResolvedValue(activeSprintPbi(YESTERDAY));
    renderBoard();

    await waitFor(() => expect(screen.getByText('Ship the feature')).toBeInTheDocument());
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows "Due soon" when the planned end date is within 2 days', async () => {
    getBoard.mockResolvedValue(activeSprintPbi(TOMORROW));
    renderBoard();

    await waitFor(() => expect(screen.getByText('Ship the feature')).toBeInTheDocument());
    expect(screen.getByText('Due soon')).toBeInTheDocument();
  });

  it('shows no badge when the planned end date is comfortably in the future', async () => {
    getBoard.mockResolvedValue(activeSprintPbi(NEXT_MONTH));
    renderBoard();

    await waitFor(() => expect(screen.getByText('Ship the feature')).toBeInTheDocument());
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
  });

  it('shows no badge for a Product Backlog item, even with a past date set', async () => {
    getBoard.mockResolvedValue({
      project: { id: 7, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 5,
          title: 'Not started yet',
          stage: 'product_backlog',
          planned_end_date: YESTERDAY,
          tasks: []
        }
      ]
    });
    renderBoard();

    await waitFor(() => expect(screen.getByText('Not started yet')).toBeInTheDocument());
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });
});
