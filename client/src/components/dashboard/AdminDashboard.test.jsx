import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { createProject } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({
  createProject: vi.fn(),
  // AdminSidebar (US-04c) loads the Admin's projects on mount.
  getResponsibleProjects: vi.fn(() => Promise.resolve({ projects: [] }))
}));

function renderDashboard() {
  useAuth.mockReturnValue({
    user: { id: 3, name: 'Admin', role: 'admin', token: 'tok-admin' },
    logout: vi.fn()
  });
  return render(
    <MemoryRouter>
      <AdminDashboard data={{ teamCount: 1 }} />
    </MemoryRouter>
  );
}

// US-04d: the Admin dashboard is where the Create Project flow starts. Who is
// allowed to create a project is enforced by the backend (POST /api/projects
// is requireAuth + requireRole('admin') - see server projectRoutes tests).
describe('AdminDashboard - Create Project (US-04d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a "+ Create Project" button styled like "+ Create Team"', () => {
    renderDashboard();

    const createProjectButton = screen.getByRole('button', { name: '+ Create Project' });
    const createTeamButton = screen.getByRole('button', { name: '+ Create Team' });
    expect(createProjectButton).toHaveClass(...createTeamButton.classList);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the Create Project flow when the button is clicked', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: '+ Create Project' }));

    expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
  });

  it('closes the Create Project flow on Cancel without creating a project', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: '+ Create Project' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });
});
