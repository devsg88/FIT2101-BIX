import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { setSessionExpiredHandler } from '../services/api.js';

// api.js's real setSessionExpiredHandler just assigns a module-level
// variable - mocked here so each test can grab the exact function
// AuthProvider registered and call it directly, the same way a real 401
// deep inside `request()` would.
vi.mock('../services/api.js', () => ({
  setSessionExpiredHandler: vi.fn()
}));

// Renders alongside whichever route is active, so a test can see both
// "is the user still logged in" and "did we land on /login" at once.
function Probe() {
  const { user, login } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.id : 'none'}</span>
      <button onClick={() => login({ id: 1, role: 'developer', token: 'abc' })}>
        log in
      </button>
    </div>
  );
}

// Mirrors main.jsx's real nesting: AuthProvider wraps everything, including
// the routes, inside the Router.
function renderApp(initialPath = '/app') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Probe />
        <Routes>
          <Route path="/app" element={<div>App Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthProvider session-expiry wiring (NFR-01)', () => {
  beforeEach(() => {
    setSessionExpiredHandler.mockClear();
  });

  it('registers exactly one handler on mount', () => {
    renderApp();

    expect(setSessionExpiredHandler).toHaveBeenCalledTimes(1);
    expect(typeof setSessionExpiredHandler.mock.calls[0][0]).toBe('function');
  });

  it('clears the logged-in user and redirects to /login?sessionExpired=1 when the handler runs', () => {
    renderApp();

    act(() => {
      screen.getByText('log in').click();
    });
    expect(screen.getByTestId('user').textContent).toBe('1');
    expect(screen.getByText('App Page')).toBeInTheDocument();

    const handler = setSessionExpiredHandler.mock.calls[0][0];
    act(() => {
      handler();
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('App Page')).not.toBeInTheDocument();
  });
});
