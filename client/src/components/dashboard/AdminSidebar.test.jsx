import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getResponsibleProjects } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({ getResponsibleProjects: vi.fn() }));

const admin = { id: 3, name: 'Admin', role: 'admin', token: 'tok-admin' };

function renderSidebar(user = admin) {
  useAuth.mockReturnValue({ user, logout: vi.fn() });
  return render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
}

// A promise the test settles by hand, to observe the loading state.
function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// US-04c: "Your projects" - real responsible-project navigation in the
// sidebar that every Admin page shares.
describe('AdminSidebar - Your projects (US-04c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links to Sprint analytics from the admin navigation', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Sprint analytics' })).toHaveAttribute('href', '/analytics/sprints');
    await screen.findByText('No responsible projects yet.');
  });

  it('links to Project analytics alongside Sprint analytics', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Project analytics' })).toHaveAttribute('href', '/analytics/projects');
    expect(screen.getByRole('link', { name: 'Sprint analytics' })).toHaveAttribute('href', '/analytics/sprints');
    await screen.findByText('No responsible projects yet.');
  });

  it('loads the projects with the logged-in Admin token', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });

    renderSidebar();

    expect(getResponsibleProjects).toHaveBeenCalledTimes(1);
    expect(getResponsibleProjects).toHaveBeenCalledWith('tok-admin');
    await screen.findByText('No responsible projects yet.');
  });

  it('shows a loading message while the projects are being fetched', async () => {
    const pending = deferred();
    getResponsibleProjects.mockReturnValue(pending.promise);

    renderSidebar();

    expect(screen.getByText('Your projects')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects...');

    pending.resolve({ projects: [] });
    await screen.findByText('No responsible projects yet.');
    expect(screen.queryByText('Loading projects...')).not.toBeInTheDocument();
  });

  it('links each returned project, by name, to its board', async () => {
    getResponsibleProjects.mockResolvedValue({
      projects: [
        { id: '1', name: 'BIX Platform' },
        { id: '3', name: 'US-04d Validation Project' }
      ]
    });

    renderSidebar();

    const nav = await screen.findByRole('navigation', { name: 'Your projects' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((link) => link.textContent)).toEqual([
      'BIX Platform',
      'US-04d Validation Project'
    ]);
    expect(screen.getByRole('link', { name: 'BIX Platform' })).toHaveAttribute(
      'href',
      '/projects/1/board'
    );
    expect(screen.getByRole('link', { name: 'US-04d Validation Project' })).toHaveAttribute(
      'href',
      '/projects/3/board'
    );
  });

  it('shows only the projects the server returned', async () => {
    getResponsibleProjects.mockResolvedValue({
      projects: [{ id: '1', name: 'BIX Platform' }]
    });

    renderSidebar();

    await screen.findByRole('link', { name: 'BIX Platform' });
    expect(screen.queryByText('Mobile App')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Your projects' });
    expect(nav.querySelectorAll('a')).toHaveLength(1);
  });

  it('shows an empty-state message when the Admin is responsible for no projects', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });

    renderSidebar();

    expect(await screen.findByText('No responsible projects yet.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Your projects' })).not.toBeInTheDocument();
  });

  it('shows an error message, without crashing, when the projects cannot be loaded', async () => {
    getResponsibleProjects.mockRejectedValue(new Error('Failed to load your projects'));

    renderSidebar();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load projects.");
    expect(screen.queryByRole('navigation', { name: 'Your projects' })).not.toBeInTheDocument();
    // The rest of the sidebar is still usable.
    expect(screen.getByRole('link', { name: 'Organization Dashboard' })).toBeInTheDocument();
  });

  it('does not ask for projects when there is no token', () => {
    renderSidebar({ id: 3, name: 'Admin', role: 'admin' });

    expect(getResponsibleProjects).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading projects...')).not.toBeInTheDocument();
  });

  it('keeps the existing sidebar navigation alongside the new section', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [{ id: '1', name: 'BIX Platform' }] });

    renderSidebar();

    await screen.findByRole('link', { name: 'BIX Platform' });
    expect(screen.getByRole('link', { name: 'Organization Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: 'Team Alpha' })).toHaveAttribute('href', '/teams/1');
    expect(screen.getByLabelText('Search teams')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  });

  // Regression: "System Settings" used to be a <button> with no onClick -
  // clicking it did nothing. Now a real link to the Settings page.
  it('links "System Settings" to /settings', async () => {
    getResponsibleProjects.mockResolvedValue({ projects: [] });

    renderSidebar();

    expect(screen.getByRole('link', { name: /System Settings/ })).toHaveAttribute(
      'href',
      '/settings'
    );
  });
});
