import { lazy, Suspense } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary.jsx';

// A page that crashes while rendering, the way a bug or unexpected data would.
let shouldThrow = true;
function CrashingPage() {
  if (shouldThrow) {
    throw new Error('Cannot read properties of undefined (reading "pbis") at BoardColumns (Board.jsx:42)');
  }
  return <p>Board loaded</p>;
}

function renderApp(initialPath = '/projects/1/board') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ErrorBoundary>
        <Routes>
          <Route path="/projects/:projectId/board" element={<CrashingPage />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </ErrorBoundary>
    </MemoryRouter>
  );
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    // React reports caught render errors to console.error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children normally when nothing fails', () => {
    shouldThrow = false;
    renderApp();

    expect(screen.getByText('Board loaded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a crashed page with a safe message instead of a blank screen', () => {
    const { container } = renderApp();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Cannot read properties|reading "pbis"|BoardColumns|Board\.jsx|at /);
  });

  it('"Return to dashboard" leaves the crashed page and shows the dashboard', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Return to dashboard' }));

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('"Try again" renders the page again once the problem has gone', () => {
    renderApp();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Board loaded')).toBeInTheDocument();
  });

  it('shows the message again if the page still fails after "Try again"', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });
});

// NFR-02 / SCRUM-195: reporting pages are lazy-loaded. If a page's chunk
// cannot be downloaded (e.g. the connection drops), the boundary must still
// show its recovery screen rather than a blank page.
describe('ErrorBoundary with a lazy-loaded page', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the recovery screen when a page chunk fails to load', async () => {
    const BrokenLazyPage = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/Burndown-x.js')));

    const { container } = render(
      <MemoryRouter initialEntries={['/projects/1/burndown']}>
        <ErrorBoundary>
          <Suspense fallback={<p>Loading...</p>}>
            <Routes>
              <Route path="/projects/:projectId/burndown" element={<BrokenLazyPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to dashboard' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/dynamically imported|assets\/Burndown/);
  });
});
