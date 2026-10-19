import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamDetail from './TeamDetail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  addTeamMember,
  getAvailableDevelopersForTeam,
  getResponsibleProjects,
  getTeamMembers,
  getTeams,
  removeTeamMember
} from '../services/api.js';

// Closes the gap an audit found: this page used to read
// client/src/data/orgMockData.js entirely - "Assign Developer" and "Remove"
// looked functional but only ever touched local React state. Now backed by
// GET/POST/DELETE /api/teams/:teamId/members (teamController.js).
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({
  addTeamMember: vi.fn(),
  getAvailableDevelopersForTeam: vi.fn(),
  // AdminSidebar, rendered inside this page, loads these on mount.
  getResponsibleProjects: vi.fn(() => Promise.resolve({ projects: [] })),
  getTeamMembers: vi.fn(),
  getTeams: vi.fn(() => Promise.resolve({ teams: [] })),
  removeTeamMember: vi.fn()
}));

const TEAM = { id: 1, name: 'Team Alpha' };
// Deliberately not named "Developer" - the role column also renders that
// exact text, and a member genuinely named "Developer" would collide with
// it in these tests (not a real app bug, just a fixture-naming footgun).
const MEMBERS = [{ id: 2, name: 'Pang', email: 'pang@bix.app', role: 'developer' }];
const AVAILABLE = [{ id: 5, name: 'New Dev', email: 'new@bix.app' }];

function renderPage(path = '/teams/1') {
  useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok-admin' } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/dashboard" element={<p>Dashboard Page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TeamDetail (real data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResponsibleProjects.mockResolvedValue({ projects: [] });
    getTeams.mockResolvedValue({ teams: [] });
    getTeamMembers.mockResolvedValue({ team: TEAM, members: MEMBERS });
    getAvailableDevelopersForTeam.mockResolvedValue({ developers: AVAILABLE });
  });

  it('loads the team and its members with the teamId and token from the URL', async () => {
    renderPage();

    await waitFor(() => expect(getTeamMembers).toHaveBeenCalledWith('1', 'tok-admin'));
  });

  it('shows the real team name and its members once loaded', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Pang')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('shows an honest empty state when the team has no members yet', async () => {
    getTeamMembers.mockResolvedValue({ team: TEAM, members: [] });
    renderPage();

    expect(await screen.findByText('No developers on this team yet.')).toBeInTheDocument();
  });

  it('redirects to the dashboard when the team does not exist', async () => {
    getTeamMembers.mockRejectedValue(Object.assign(new Error('Team not found'), { status: 404 }));
    renderPage();

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
  });

  it('shows an error with Retry when the team fails to load for another reason', async () => {
    getTeamMembers.mockRejectedValue(new Error('Could not reach the server.'));
    renderPage();

    expect(await screen.findByText("Couldn't load this team.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('opens the assign modal and loads available developers for this team', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByRole('button', { name: '+ Assign Developer' }));

    expect(await screen.findByText('New Dev')).toBeInTheDocument();
    expect(getAvailableDevelopersForTeam).toHaveBeenCalledWith('1', 'tok-admin');
  });

  it('assigns a developer and refreshes the member list from the server', async () => {
    addTeamMember.mockResolvedValue({ members: [...MEMBERS, { id: 5, name: 'New Dev', email: 'new@bix.app', role: 'developer' }] });
    renderPage();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '+ Assign Developer' }));
    fireEvent.click(await screen.findByText('New Dev'));

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(addTeamMember).toHaveBeenCalledWith('1', 5, 'tok-admin'));
    expect(await screen.findByText('New Dev')).toBeInTheDocument();
  });

  it('filters the assign-modal candidate list by search', async () => {
    getAvailableDevelopersForTeam.mockResolvedValue({
      developers: [
        { id: 5, name: 'New Dev', email: 'new@bix.app' },
        { id: 6, name: 'Other Dev', email: 'other@bix.app' }
      ]
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '+ Assign Developer' }));
    await screen.findByText('New Dev');

    fireEvent.change(screen.getByLabelText('Search developers'), { target: { value: 'other' } });

    expect(screen.queryByText('New Dev')).not.toBeInTheDocument();
    expect(screen.getByText('Other Dev')).toBeInTheDocument();
  });

  it('removes a member and refreshes the list from the server', async () => {
    removeTeamMember.mockResolvedValue({ members: [] });
    renderPage();
    await screen.findByText('Pang');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeTeamMember).toHaveBeenCalledWith('1', 2, 'tok-admin'));
    expect(await screen.findByText('No developers on this team yet.')).toBeInTheDocument();
  });

  it('shows the backend error inline when assigning fails, without closing the modal', async () => {
    addTeamMember.mockRejectedValue(new Error('Only developers can be added as team members'));
    renderPage();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '+ Assign Developer' }));
    fireEvent.click(await screen.findByText('New Dev'));

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only developers can be added as team members'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
