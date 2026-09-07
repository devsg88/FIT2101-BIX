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
});
