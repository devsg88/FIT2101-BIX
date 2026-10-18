import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({ getDashboard: vi.fn() }));
// The two dashboards have their own tests; here they only show which one loaded.
vi.mock('../components/dashboard/AdminDashboard.jsx', () => ({ default: () => <p>Admin dashboard</p> }));
vi.mock('../components/dashboard/DeveloperDashboard.jsx', () => ({ default: () => <p>Developer dashboard</p> }));

const developer = { id: 7, name: 'Dev', role: 'developer', token: 'tok-dev' };

function renderDashboard(user = developer) {
  useAuth.mockReturnValue({ user, logout: vi.fn() });
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// NFR-03 / SCRUM-191: a failed dashboard load offers a way forward.
describe('Dashboard load failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the dashboard for the logged-in role once loaded', async () => {
    getDashboard.mockResolvedValue({ role: 'developer', data: {} });

    renderDashboard();

    expect(await screen.findByText('Developer dashboard')).toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledWith('tok-dev');
  });

  it('shows an error with Retry - not "try refreshing", which would sign the user out', async () => {
    getDashboard.mockRejectedValue(
      Object.assign(new Error('Could not reach the server. Check your connection and try again.'), { status: 0 })
    );

    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your dashboard.");
    expect(alert).not.toHaveTextContent(/refresh/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('runs the load again on Retry, and a successful retry clears the error', async () => {
    getDashboard
      .mockRejectedValueOnce(Object.assign(new Error('Something went wrong on our side.'), { status: 500 }))
      .mockResolvedValueOnce({ role: 'admin', data: { teamCount: 1 } });

    renderDashboard({ ...developer, role: 'admin' });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Admin dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });

  it('shows Access Denied with no Retry for a 403', async () => {
    getDashboard.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
