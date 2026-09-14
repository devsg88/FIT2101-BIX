import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeveloperDashboard from './DeveloperDashboard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

const mockLogout = vi.fn();

function renderDashboard(user = { id: 1, name: 'Pang', role: 'developer' }) {
  useAuth.mockReturnValue({ user, logout: mockLogout });
  return render(
    <MemoryRouter>
      <DeveloperDashboard />
    </MemoryRouter>
  );
}

describe('DeveloperDashboard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the topbar with logo, nav links, and user info', () => {
    renderDashboard();

    expect(screen.getByText('BIX')).toBeInTheDocument();
    expect(screen.getByText('DashBoard')).toBeInTheDocument();
    const myProjectLink = screen.getByRole('link', { name: /My Project$/i });
    expect(myProjectLink).toHaveAttribute('href', '/projects');
    expect(screen.getAllByText('Pang').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('renders the greeting banner matching Figma design', () => {
    renderDashboard();

    expect(screen.getByText('Good morning,')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pang/ })).toBeInTheDocument();
    expect(
      screen.getByText("Here's an overview of your projects and current work.")
    ).toBeInTheDocument();
  });

  it('renders all three stat cards with correct metrics', () => {
    renderDashboard();

    const myProjectsElements = screen.getAllByText('My Projects');
    expect(myProjectsElements.length).toBe(2); // One in stat card, one in table card
    expect(screen.getByText('Assigned projects')).toBeInTheDocument();

    const statCardLink = myProjectsElements[0].closest('a');
    expect(statCardLink).toHaveAttribute('href', '/projects');

    const viewAllLink = screen.getByRole('link', { name: /View all Projects/i });
    expect(viewAllLink).toHaveAttribute('href', '/projects');

    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('Task in progress')).toBeInTheDocument();

    expect(screen.getByText('Overall Progess')).toBeInTheDocument();
    expect(screen.getAllByText('60%').length).toBe(2);
    expect(screen.getByText('Across active sprint')).toBeInTheDocument();
  });

  it('renders the My Projects list with projects, statuses, and Open Board links', () => {
    renderDashboard();

    const projectAlphaElements = screen.getAllByText('Project Alpha');
    expect(projectAlphaElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active')).toBeInTheDocument();

    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();

    expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();

    const openBoardLinks = screen.getAllByRole('link', { name: /Open Board/i });
    expect(openBoardLinks).toHaveLength(3);
    expect(openBoardLinks[0]).toHaveAttribute('href', '/projects/1/board');
    expect(openBoardLinks[1]).toHaveAttribute('href', '/projects/2/board');
    expect(openBoardLinks[2]).toHaveAttribute('href', '/projects/3/board');
  });

  it('renders Task History with completed tasks and footer note', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Task History' })).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Completed - 4h ago')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Completed - 3h ago')).toBeInTheDocument();
    expect(
      screen.getByText("That's everything from the last 7 days")
    ).toBeInTheDocument();
  });

  it('opens dropdown and allows signing out', () => {
    renderDashboard();

    const userProfile = screen.getByRole('button', { name: /Pang/ });
    fireEvent.click(userProfile);

    const signOutBtn = screen.getByRole('button', { name: 'Sign out' });
    expect(signOutBtn).toBeInTheDocument();

    fireEvent.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
