import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccessDenied from './AccessDenied.jsx';

describe('AccessDenied (NFR-01)', () => {
  it('shows the heading, the explanation, and a link back to the dashboard', () => {
    render(
      <MemoryRouter>
        <AccessDenied />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(
      screen.getByText(/don.t have permission to view this page or perform this action/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/contact your project administrator/)
    ).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Back to Dashboard' });
    expect(backLink).toHaveAttribute('href', '/dashboard');
  });

  it('never reveals any project-specific detail about why access was denied', () => {
    render(
      <MemoryRouter>
        <AccessDenied />
      </MemoryRouter>
    );

    // NFR-01: a denied request must not leak protected project information -
    // this component takes no props carrying a project name, id or backend
    // message, so there is nothing project-specific it could render.
    expect(screen.queryByText(/project \d/i)).not.toBeInTheDocument();
  });
});
