import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyProjects from './MyProjects.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));
vi.mock('../services/api.js', () => ({
  getDashboard: vi.fn()
}));

const PROJECTS = [
  { id: 1, name: 'Project Alpha', status: 'active', progress: 60 },
  { id: 2, name: 'Project Beta', status: 'planning', progress: 20 },
  { id: 3, name: 'Project Gamma', status: 'not-started', progress: null }
];

function renderMyProjects(user = { id: 1, name: 'Pang', role: 'developer', token: 'tok' }) {
  useAuth.mockReturnValue({ user, logout: vi.fn() });
  return render(
    <MemoryRouter>
      <MyProjects />
    </MemoryRouter>
  );
}

describe('MyProjects page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboard.mockResolvedValue({ role: 'developer', data: { projects: PROJECTS } });
  });

  it('renders the topbar with My Project as active', async () => {
    renderMyProjects();

    expect(screen.getByText('BIX')).toBeInTheDocument();
    expect(screen.getByText('DashBoard')).toBeInTheDocument();
    const myProjectLink = screen.getByRole('link', { name: /My Project/i });
    expect(myProjectLink).toHaveClass('dev-nav-link--active');
    await waitFor(() => expect(getDashboard).toHaveBeenCalledWith('tok'));
  });

  it('renders the title, subtitle, and search input', () => {
    renderMyProjects();

    expect(screen.getByRole('heading', { name: 'My Projects' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Project assigned to you. Only projects you're a memebr of appear here."
      )
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search projects')).toBeInTheDocument();
  });

  it('shows a loading state, then the real projects from the dashboard API - not hardcoded mock data', async () => {
    renderMyProjects();

    expect(screen.getByText('Loading your projects...')).toBeInTheDocument();

    expect(await screen.findByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Project Gamma')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'All' })).toHaveClass(
      'my-projects-filter-btn--active'
    );

    const openBoardBtns = screen.getAllByRole('link', { name: /Open Board/i });
    expect(openBoardBtns).toHaveLength(3);
    expect(openBoardBtns[0]).toHaveAttribute('href', '/projects/1/board');
    expect(openBoardBtns[1]).toHaveAttribute('href', '/projects/2/board');
    expect(openBoardBtns[2]).toHaveAttribute('href', '/projects/3/board');
  });

  it('shows real status and progress, "No tasks yet" when progress is null', async () => {
    renderMyProjects();

    const alphaCard = (await screen.findByText('Project Alpha')).closest('article');
    const betaCard = screen.getByText('Project Beta').closest('article');
    const gammaCard = screen.getByText('Project Gamma').closest('article');

    expect(alphaCard).toHaveTextContent('Active');
    expect(alphaCard).toHaveTextContent('60%');
    expect(betaCard).toHaveTextContent('Planning');
    expect(betaCard).toHaveTextContent('20%');
    expect(gammaCard).toHaveTextContent('Not started');
    expect(gammaCard).toHaveTextContent('No tasks yet');
  });

  it('marks fields the backend does not provide as honestly unavailable, not invented', async () => {
    renderMyProjects();

    await screen.findByText('Project Alpha');

    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No description available yet.').length).toBe(3);
    expect(screen.getAllByText('Team info not available yet').length).toBe(3);
  });

  it('shows a retry-able error state when the dashboard call fails', async () => {
    getDashboard.mockReset();
    getDashboard.mockRejectedValueOnce(new Error('network blip'));
    renderMyProjects();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your projects.");

    getDashboard.mockResolvedValueOnce({ role: 'developer', data: { projects: PROJECTS } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Project Alpha')).toBeInTheDocument();
  });

  it('shows an empty state when the developer has no assigned projects', async () => {
    getDashboard.mockReset();
    getDashboard.mockResolvedValue({ role: 'developer', data: { projects: [] } });
    renderMyProjects();

    expect(await screen.findByText('No projects to show.')).toBeInTheDocument();
  });

  it('filters project cards when clicking status filter buttons', async () => {
    renderMyProjects();
    await screen.findByText('Project Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));

    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
  });

  it('filters project cards by search query', async () => {
    renderMyProjects();
    await screen.findByText('Project Alpha');

    const searchInput = screen.getByPlaceholderText('Search projects');
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
  });

  // The old page had a fake locked "not assigned" demo card and fake
  // pagination (a static "page 2" that was always empty) - both removed:
  // the real API never returns a project this developer isn't a member of,
  // so there was nothing genuine for either to demonstrate.
  it('has no fabricated "locked project" card and no fake pagination controls', async () => {
    renderMyProjects();
    await screen.findByText('Project Alpha');

    expect(screen.queryByText('No access')).not.toBeInTheDocument();
    expect(screen.queryByText('Not assigned')).not.toBeInTheDocument();
    expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  // US-16 (T16.4): the Developer's entry point into Settings.
  it('links Settings to /settings in the user menu', () => {
    renderMyProjects();

    fireEvent.click(screen.getByRole('button', { name: /Pang/ }));

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});
