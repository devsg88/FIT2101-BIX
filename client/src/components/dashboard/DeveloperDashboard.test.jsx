import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeveloperDashboard from './DeveloperDashboard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

const mockLogout = vi.fn();

const sampleData = {
  role: 'developer',
  data: {
    projectCount: 3,
    projects: [
      { id: 1, name: 'Project Alpha', status: 'active', progress: 60 },
      { id: 2, name: 'Project Beta', status: 'planning', progress: 20 },
      { id: 3, name: 'Project Gamma', status: 'not-started', progress: null }
    ],
    myTasksCount: 1,
    overallProgressPercent: 60,
    taskHistory: [
      { id: 'task-2', title: 'Task 2', projectName: 'Project Alpha', completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
      { id: 'task-1', title: 'Task 1', projectName: 'Project Alpha', completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }
    ]
  }
};

function renderDashboard({ user = { id: 1, name: 'Pang', role: 'developer' }, data = sampleData } = {}) {
  useAuth.mockReturnValue({ user, logout: mockLogout });
  return render(
    <MemoryRouter>
      <DeveloperDashboard data={data} />
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

  it('renders all three stat cards from real dashboard data', () => {
    renderDashboard();

    const myProjectsElements = screen.getAllByText('My Projects');
    expect(myProjectsElements.length).toBe(2); // One in stat card, one in table card
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Assigned projects')).toBeInTheDocument();

    const statCardLink = myProjectsElements[0].closest('a');
    expect(statCardLink).toHaveAttribute('href', '/projects');

    const viewAllLink = screen.getByRole('link', { name: /View all Projects/i });
    expect(viewAllLink).toHaveAttribute('href', '/projects');

    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('Open tasks assigned to you')).toBeInTheDocument();

    expect(screen.getByText('Overall Progess')).toBeInTheDocument();
    expect(screen.getAllByText('60%').length).toBe(2); // stat card + Project Alpha's row
    expect(screen.getByText('Tasks done vs total, across your projects')).toBeInTheDocument();
  });

  it('shows N/A and an honest sub-label when there is no task data at all', () => {
    renderDashboard({
      data: {
        role: 'developer',
        data: { projectCount: 0, projects: [], myTasksCount: 0, overallProgressPercent: null, taskHistory: [] }
      }
    });

    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('renders the My Projects list with real statuses, progress and Open Board links', () => {
    renderDashboard();

    const projectAlphaElements = screen.getAllByText('Project Alpha');
    expect(projectAlphaElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active')).toBeInTheDocument();

    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();

    expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();

    const openBoardLinks = screen.getAllByRole('link', { name: /Open Board/i });
    expect(openBoardLinks).toHaveLength(3);
    expect(openBoardLinks[0]).toHaveAttribute('href', '/projects/1/board');
    expect(openBoardLinks[1]).toHaveAttribute('href', '/projects/2/board');
    expect(openBoardLinks[2]).toHaveAttribute('href', '/projects/3/board');
  });

  it('shows an honest empty state instead of a fake table row when there are no projects', () => {
    renderDashboard({
      data: {
        role: 'developer',
        data: { projectCount: 0, projects: [], myTasksCount: 0, overallProgressPercent: null, taskHistory: [] }
      }
    });

    expect(screen.getByText('No projects assigned yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Board/i })).not.toBeInTheDocument();
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

  it('shows an honest empty state instead of fake entries when Task History is empty', () => {
    renderDashboard({
      data: {
        role: 'developer',
        data: { projectCount: 1, projects: [], myTasksCount: 0, overallProgressPercent: null, taskHistory: [] }
      }
    });

    expect(screen.getByText('No tasks completed in the last 7 days.')).toBeInTheDocument();
    expect(screen.queryByText("That's everything from the last 7 days")).not.toBeInTheDocument();
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
