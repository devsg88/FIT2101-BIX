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

vi.mock('./pages/Board.jsx', () => ({
  default: () => <div>Board Page</div>
}));

vi.mock('./pages/ProductBacklog.jsx', () => ({
  default: () => <div>Product Backlog Page</div>
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

  it('renders the board route for an authenticated user', () => {
    renderApp('/projects/7/board', { id: 1, role: 'developer', token: 'abc' });
    expect(screen.getByText('Board Page')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user from the board route to login', () => {
    renderApp('/projects/7/board', null);
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });

  it('renders the completed-work route (US-12) for an authenticated user', () => {
    // Board.jsx itself decides whether to show the history sidebar based on
    // the URL (see Board.test.jsx) - this only checks the route reaches the
    // same protected page, same as /board.
    renderApp('/projects/7/completed-work', { id: 1, role: 'developer', token: 'abc' });
    expect(screen.getByText('Board Page')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user from the completed-work route to login', () => {
    renderApp('/projects/7/completed-work', null);
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });
});

describe('Product Backlog route (US-04b)', () => {
  it('shows the backlog page to an Admin', () => {
    renderApp('/projects/1/backlog', { id: 3, role: 'admin', token: 'abc' });
    expect(screen.getByText('Product Backlog Page')).toBeInTheDocument();
  });

  it('sends a Developer to the dashboard instead', () => {
    renderApp('/projects/1/backlog', { id: 2, role: 'developer', token: 'abc' });
    expect(screen.queryByText('Product Backlog Page')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page', () => {
    renderApp('/projects/1/backlog', null);
    expect(screen.queryByText('Product Backlog Page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });
});
