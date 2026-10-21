import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Burndown, { EMPTY_MESSAGES, pickDefaultSprint } from './Burndown.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectSprints, getSprintBurndown } from '../services/api.js';

// US-15 (SCRUM-161).

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({
  getProjectSprints: vi.fn(),
  getSprintBurndown: vi.fn()
}));

const sprints = [
  { id: 1, name: 'Sprint 1', status: 'completed', started_at: '2026-08-03T09:00:00Z' },
  { id: 2, name: 'Sprint 2', status: 'active', started_at: '2026-08-17T09:00:00Z' },
  { id: 3, name: 'Sprint 3', status: 'planning', started_at: null }
];

function burndownFor(sprint, overrides = {}) {
  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: '2026-08-17',
      endDate: '2026-08-19'
    },
    totalPoints: 8,
    remainingPoints: 2,
    series: [
      { date: '2026-08-17', ideal: 8, actual: 8 },
      { date: '2026-08-18', ideal: 4, actual: 2 },
      { date: '2026-08-19', ideal: 0, actual: null }
    ],
    emptyReason: null,
    ...overrides
  };
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderPage(path = '/projects/1/burndown') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/projects/:projectId/burndown"
          element={
            <>
              <Burndown />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('pickDefaultSprint', () => {
  it('prefers the active Sprint', () => {
    expect(pickDefaultSprint(sprints).id).toBe(2);
  });

  it('falls back to the most recently started Sprint, then the first', () => {
    expect(pickDefaultSprint([sprints[0], sprints[2]]).id).toBe(1);
    expect(pickDefaultSprint([sprints[2]]).id).toBe(3);
    expect(pickDefaultSprint([])).toBeNull();
  });
});

describe('Burndown page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 7, role: 'developer', name: 'Dev', token: 'tok' } });
    getProjectSprints.mockResolvedValue({ sprints });
    getSprintBurndown.mockImplementation((projectId, sprintId) =>
      Promise.resolve(burndownFor(sprints.find((sprint) => sprint.id === sprintId)))
    );
  });

  it('shows a loading state, then the active Sprint\'s chart', async () => {
    renderPage();

    expect(screen.getByText('Loading Sprints...')).toBeInTheDocument();

    expect(await screen.findByTestId('burndown-ideal-line')).toBeInTheDocument();
    expect(getProjectSprints).toHaveBeenCalledWith('1', 'tok');
    expect(getSprintBurndown).toHaveBeenCalledWith('1', 2, 'tok');
  });

  it('shows which Sprint is displayed, its dates and the remaining Story Points', async () => {
    renderPage();

    const summary = await screen.findByTestId('burndown-summary');
    expect(summary).toHaveTextContent('Sprint 2');
    expect(summary).toHaveTextContent('17 Aug to 19 Aug');
    expect(summary).toHaveTextContent('2 of 8 Story Points remaining');
    expect(screen.getByLabelText('Sprint')).toHaveValue('2');
  });

  it('loads the Sprint named in the URL', async () => {
    renderPage('/projects/1/burndown?sprint=1');

    await screen.findByTestId('burndown-summary');
    expect(getSprintBurndown).toHaveBeenCalledWith('1', 1, 'tok');
    expect(getSprintBurndown).not.toHaveBeenCalledWith('1', 2, 'tok');
  });

  it('ignores a Sprint id in the URL that is not one of this project\'s Sprints', async () => {
    renderPage('/projects/1/burndown?sprint=99');

    await screen.findByTestId('burndown-summary');
    expect(getSprintBurndown).toHaveBeenCalledWith('1', 2, 'tok');
  });

  it('loads another Sprint when one is picked, and keeps it in the URL', async () => {
    renderPage();
    await screen.findByTestId('burndown-summary');

    fireEvent.change(screen.getByLabelText('Sprint'), { target: { value: '1' } });

    await waitFor(() => expect(getSprintBurndown).toHaveBeenCalledWith('1', 1, 'tok'));
    expect(await screen.findByText('Sprint 1', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/1/burndown?sprint=1');
  });

  it('loads another Sprint when PostgreSQL returns bigint ids as strings', async () => {
    const stringIdSprints = sprints.map((sprint) => ({
      ...sprint,
      id: String(sprint.id)
    }));
    getProjectSprints.mockResolvedValue({ sprints: stringIdSprints });
    getSprintBurndown.mockImplementation((projectId, sprintId) =>
      Promise.resolve(
        burndownFor(
          stringIdSprints.find((sprint) => String(sprint.id) === String(sprintId))
        )
      )
    );

    renderPage();
    await screen.findByTestId('burndown-summary');

    fireEvent.change(screen.getByLabelText('Sprint'), { target: { value: '1' } });

    await waitFor(() => expect(getSprintBurndown).toHaveBeenCalledWith('1', '1', 'tok'));
    expect(await screen.findByText('Sprint 1', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sprint')).toHaveValue('1');
  });

  it('shows the server message and a Retry when the Sprints fail to load', async () => {
    getProjectSprints.mockRejectedValueOnce(new Error('You are not a member of this project'));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You are not a member of this project');
    expect(getSprintBurndown).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('burndown-ideal-line')).toBeInTheDocument();
    expect(getProjectSprints).toHaveBeenCalledTimes(2);
  });

  // NFR-01: this is the project-level access gate for the whole page (same
  // member/responsible-Admin rule as the board) - a real 403 here shows
  // Access Denied, not the generic error/Retry treatment above.
  it('shows Access Denied, not the generic error/Retry, when Sprints are forbidden', async () => {
    const forbidden = new Error('You are not a member of this project');
    forbidden.status = 403;
    getProjectSprints.mockRejectedValueOnce(forbidden);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(getSprintBurndown).not.toHaveBeenCalled();
  });

  it('shows an error with Retry when the burndown fails to load, and recovers', async () => {
    getSprintBurndown.mockRejectedValueOnce(new Error('Failed to load the burndown chart'));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load the burndown chart');
    expect(screen.queryByTestId('burndown-ideal-line')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('burndown-ideal-line')).toBeInTheDocument();
  });

  it('shows an empty state when the project has no Sprints', async () => {
    getProjectSprints.mockResolvedValue({ sprints: [] });

    renderPage();

    expect(await screen.findByText(/This project has no Sprints yet/)).toBeInTheDocument();
    expect(getSprintBurndown).not.toHaveBeenCalled();
  });

  it.each(Object.keys(EMPTY_MESSAGES))(
    'shows a clear message instead of a chart for emptyReason %s',
    async (emptyReason) => {
      getSprintBurndown.mockResolvedValue(
        burndownFor(sprints[1], { emptyReason, series: [] })
      );

      renderPage();

      expect(await screen.findByText(EMPTY_MESSAGES[emptyReason])).toBeInTheDocument();
      expect(screen.queryByTestId('burndown-ideal-line')).not.toBeInTheDocument();
    }
  );

  it('links back to the project board', async () => {
    renderPage();

    expect(screen.getByRole('link', { name: '<- Back to board' })).toHaveAttribute(
      'href',
      '/projects/1/board'
    );
  });
});
