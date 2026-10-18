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
