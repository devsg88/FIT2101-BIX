import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderRoleGuarded(allowedRoles) {
  return render(
    <MemoryRouter initialEntries={['/teams/1']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        <Route
          path="/teams/1"
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Admin Team Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no user', () => {
    useAuth.mockReturnValue({ user: null });

    renderProtected();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when a user is present', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'abc' } });

    renderProtected();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('redirects to /login when there is no user, even with allowedRoles set', () => {
    useAuth.mockReturnValue({ user: null });

    renderRoleGuarded(['admin']);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when the user has an allowed role', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin', token: 'abc' } });

    renderRoleGuarded(['admin']);

    expect(screen.getByText('Admin Team Page')).toBeInTheDocument();
  });

  // NFR-01: a wrong-role user stays on the URL they requested and sees
  // AccessDenied there, rather than being silently bounced to /dashboard
  // with no explanation - not /login either, since they do have a valid
  // session, they're just not permitted on this particular page.
  it('shows Access Denied, not a silent redirect, when the user is authenticated but the wrong role', () => {
    useAuth.mockReturnValue({ user: { id: 2, role: 'developer', token: 'abc' } });

    renderRoleGuarded(['admin']);

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByText('Admin Team Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
  });

  it("Access Denied's Back to Dashboard link points at /dashboard", () => {
    useAuth.mockReturnValue({ user: { id: 2, role: 'developer', token: 'abc' } });

    renderRoleGuarded(['admin']);

    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });
});
