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

  it('renders all four filter buttons and project cards', () => {
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

    expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    expect(screen.getByText('@abc.eng')).toBeInTheDocument();

    const openBoardBtns = screen.getAllByRole('link', { name: /Open Board/i });
    expect(openBoardBtns).toHaveLength(3);
    expect(openBoardBtns[0]).toHaveAttribute('href', '/projects/1/board');
    expect(openBoardBtns[1]).toHaveAttribute('href', '/projects/2/board');
    expect(openBoardBtns[2]).toHaveAttribute('href', '/projects/3/board');
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
});
