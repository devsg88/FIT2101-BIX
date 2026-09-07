import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { useAuth } from './context/AuthContext.jsx';

vi.mock('./context/AuthContext.jsx', () => ({
  useAuth: vi.fn()
}));

vi.mock('./pages/Dashboard.jsx', () => ({
  default: () => <div>Dashboard Page</div>
}));

function renderApp(initialPath, user) {
  useAuth.mockReturnValue({ user });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  );
}

describe('App redirect logic', () => {
  it('sends an unauthenticated user at / to the login page', () => {
    renderApp('/', null);
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });

  it('sends an authenticated user at / to the dashboard', () => {
    renderApp('/', { id: 1, role: 'admin', token: 'abc' });
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('bounces an authenticated user away from /login to the dashboard', () => {
    renderApp('/login', { id: 1, role: 'developer', token: 'abc' });
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });
});
