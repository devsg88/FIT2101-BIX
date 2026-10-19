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

vi.mock('./pages/DemoMailbox.jsx', () => ({
  default: () => <h2>Demo inbox</h2>
}));

vi.mock('./pages/Settings.jsx', () => ({
  default: () => <div>Settings Page</div>
}));

vi.mock('./pages/SprintAnalytics.jsx', () => ({
  default: () => <div>Sprint Analytics Page</div>
}));

vi.mock('./pages/ProjectAnalytics.jsx', () => ({
  default: () => <div>Project Analytics Page</div>
}));

vi.mock('./pages/Burndown.jsx', () => ({
  default: () => <div>Burndown Page</div>
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

describe('Sprint analytics route', () => {
  it('allows an admin to open the analytics page', async () => {
    renderApp('/analytics/sprints', { id: 3, role: 'admin', token: 'abc' });
    // Lazy-loaded route (NFR-02): the page arrives after its chunk loads.
    expect(await screen.findByText('Sprint Analytics Page')).toBeInTheDocument();
  });

  it('denies developers without rendering the analytics page', () => {
    renderApp('/analytics/sprints', { id: 7, role: 'developer', token: 'abc' });
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByText('Sprint Analytics Page')).not.toBeInTheDocument();
  });

  it('redirects logged-out visitors to login', () => {
    renderApp('/analytics/sprints', null);
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
    expect(screen.queryByText('Sprint Analytics Page')).not.toBeInTheDocument();
  });
});

describe('Project analytics route', () => {
  it('allows an admin to open project comparisons', async () => {
    renderApp('/analytics/projects', { id: 3, role: 'admin', token: 'abc' });
    // Lazy-loaded route (NFR-02): the page arrives after its chunk loads.
    expect(await screen.findByText('Project Analytics Page')).toBeInTheDocument();
  });

  it('does not render project comparisons for a developer', () => {
    renderApp('/analytics/projects', { id: 7, role: 'developer', token: 'abc' });
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByText('Project Analytics Page')).not.toBeInTheDocument();
  });

  it('redirects a logged-out visitor to login', () => {
    renderApp('/analytics/projects', null);
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
    expect(screen.queryByText('Project Analytics Page')).not.toBeInTheDocument();
  });
});

describe('Product Backlog route (US-04b)', () => {
  it('shows the backlog page to an Admin', () => {
    renderApp('/projects/1/backlog', { id: 3, role: 'admin', token: 'abc' });
    expect(screen.getByText('Product Backlog Page')).toBeInTheDocument();
  });

  // NFR-01: a wrong-role user now sees Access Denied on this same URL,
  // not a silent bounce to the dashboard (see ProtectedRoute.jsx/.test.jsx).
  it('shows Access Denied to a Developer instead of the backlog or the dashboard', () => {
    renderApp('/projects/1/backlog', { id: 2, role: 'developer', token: 'abc' });
    expect(screen.queryByText('Product Backlog Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page', () => {
    renderApp('/projects/1/backlog', null);
    expect(screen.queryByText('Product Backlog Page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });
});

describe('Settings route', () => {
  it('shows the Settings page to an Admin', () => {
    renderApp('/settings', { id: 3, role: 'admin', token: 'abc' });
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });

  // US-16 (T16.3): previously admin-only (Access Denied for a Developer);
  // now any authenticated user reaches the route - Settings.jsx itself
  // picks the right view per role (see Settings.test.jsx for that).
  it('shows the Settings page to a Developer too, not Access Denied', () => {
    renderApp('/settings', { id: 2, role: 'developer', token: 'abc' });
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Access Denied' })).not.toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page', () => {
    renderApp('/settings', null);
    expect(screen.queryByText('Settings Page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
  });
});

describe('Password reset routes (US-14)', () => {
  it('renders forgot-password without requiring a session', () => {
    renderApp('/forgot-password', null);
    expect(screen.getByRole('heading', { name: 'Forgot password' })).toBeInTheDocument();
  });

  it('renders reset-password without requiring a session', () => {
    renderApp('/reset-password', null);
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
  });

  it('renders the demo inbox without requiring a session when enabled', () => {
    vi.stubEnv('VITE_DEMO_MAILBOX_ENABLED', 'true');
    renderApp('/demo-mailbox', null);
    expect(screen.getByRole('heading', { name: 'Demo inbox' })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('does not route to the demo inbox when VITE_DEMO_MAILBOX_ENABLED is unset (deployed default)', () => {
    renderApp('/demo-mailbox', null);
    expect(screen.queryByRole('heading', { name: 'Demo inbox' })).not.toBeInTheDocument();
  });
});

// NFR-02 / SCRUM-195: the reporting pages are lazy-loaded. The route guard
// still decides first, and the page appears once its chunk has loaded.
describe('Burndown route (lazy-loaded)', () => {
  it('shows a loading state, then the Burndown page, for an authenticated user', async () => {
    renderApp('/projects/1/burndown', { id: 7, role: 'developer', token: 'abc' });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Burndown Page')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('redirects a logged-out visitor to login without rendering Burndown', () => {
    renderApp('/projects/1/burndown', null);

    expect(screen.getByRole('heading', { name: 'BIX' })).toBeInTheDocument();
    expect(screen.queryByText('Burndown Page')).not.toBeInTheDocument();
  });
});
