import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyProjects from './MyProjects.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

function renderMyProjects(user = { id: 1, name: 'Pang', role: 'developer' }) {
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
  });

  it('renders the topbar with My Project as active', () => {
    renderMyProjects();

    expect(screen.getByText('BIX')).toBeInTheDocument();
    expect(screen.getByText('DashBoard')).toBeInTheDocument();
    const myProjectLink = screen.getByRole('link', { name: /My Project/i });
    expect(myProjectLink).toHaveClass('dev-nav-link--active');
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

  it('renders all four filter buttons and the first page of project cards', () => {
    renderMyProjects();

    expect(screen.getByRole('button', { name: 'All' })).toHaveClass(
      'my-projects-filter-btn--active'
    );
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not started' })).toBeInTheDocument();

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Sprint 4')).toBeInTheDocument();
    expect(screen.getByText('@abc.tan')).toBeInTheDocument();

    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('@abc.pang')).toBeInTheDocument();

    // Project Gamma (US-05: not assigned to this developer) still shows on
    // page 1, but locked - no meta/team details and no board access.
    expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.queryByText('@abc.eng')).not.toBeInTheDocument();

    const openBoardBtns = screen.getAllByRole('link', { name: /Open Board/i });
    expect(openBoardBtns).toHaveLength(2);
    expect(openBoardBtns[0]).toHaveAttribute('href', '/projects/1/board');
    expect(openBoardBtns[1]).toHaveAttribute('href', '/projects/2/board');
  });

  it('filters project cards when clicking status filter buttons', () => {
    renderMyProjects();

    const planningBtn = screen.getByRole('button', { name: 'Planning' });
    fireEvent.click(planningBtn);

    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
  });

  it('filters project cards by search query', () => {
    renderMyProjects();

    const searchInput = screen.getByPlaceholderText('Search projects');
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
  });

  it('renders pagination footer', () => {
    renderMyProjects();

    expect(screen.getByText('1/2 pages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next page/i })).toBeInTheDocument();
  });

  it('navigates to page 2 and shows an empty state with no projects', () => {
    renderMyProjects();

    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));

    expect(screen.getByText('2/2 pages')).toBeInTheDocument();
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    expect(screen.getByText('No projects to show on this page.')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Open Board/i })
    ).not.toBeInTheDocument();
  });

  it('navigates back to page 1 with the previous page button', () => {
    renderMyProjects();

    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    expect(screen.getByText('2/2 pages')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Previous page/i }));

    expect(screen.getByText('1/2 pages')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
  });

  it('shows the access-denied modal when clicking No access, and can close it', () => {
    renderMyProjects();

    fireEvent.click(screen.getByRole('button', { name: 'No access' }));

    expect(
      screen.getByText("You don't have access to this project")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not currently assigned to Project Gamma/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to my projects' }));

    expect(
      screen.queryByText("You don't have access to this project")
    ).not.toBeInTheDocument();
  });

  it('closes the access-denied modal with the close button', () => {
    renderMyProjects();

    fireEvent.click(screen.getByRole('button', { name: 'No access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      screen.queryByText("You don't have access to this project")
    ).not.toBeInTheDocument();
  });
});
