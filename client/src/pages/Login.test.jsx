import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// LoginForm (rendered inside Login) calls useAuth() for its own login()
// call - mocked here purely so Login can render in isolation; the banner
// itself does not depend on auth state at all, only on the URL.
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

function renderLogin(path) {
  useAuth.mockReturnValue({ login: vi.fn() });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>
  );
}

describe('Login page session-expired banner (NFR-01)', () => {
  it('shows the session-expired banner when the URL has sessionExpired=1', () => {
    renderLogin('/login?sessionExpired=1');

    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByText(/please log in again/i)).toBeInTheDocument();
  });

  it('shows no banner on a normal, direct visit to /login', () => {
    renderLogin('/login');

    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
  });

  it('shows no banner for any other value of the query param', () => {
    renderLogin('/login?sessionExpired=0');

    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
  });
});
