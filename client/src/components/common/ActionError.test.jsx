import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionError from './ActionError.jsx';

describe('ActionError (NFR-01)', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ActionError error={null} fallback="fallback text" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the error message verbatim for a plain (non-403) failure', () => {
    render(<ActionError error={new Error('Cannot delete a PBI that is in the Active Sprint')} fallback="fallback text" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Cannot delete a PBI that is in the Active Sprint'
    );
  });

  it('falls back to the given message when the error has none', () => {
    render(<ActionError error={new Error()} fallback="Something went wrong. Please try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('does not add the forbidden styling for a non-403 error', () => {
    const err = new Error('Failed to save');
    err.status = 500;
    render(<ActionError error={err} fallback="fallback" className="project-board__card-error" />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toBe('project-board__card-error');
  });

  it('adds the forbidden styling and icon for a 403, while still showing the real backend message', () => {
    const err = new Error('You do not have permission to perform this action');
    err.status = 403;
    render(<ActionError error={err} fallback="fallback" className="project-board__card-error" />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toBe('project-board__card-error project-board__card-error--forbidden');
    expect(alert).toHaveTextContent('You do not have permission to perform this action');
    expect(alert.querySelector('svg')).toBeInTheDocument();
  });

  it('passes id through, for forms that wire the error to an input via aria-describedby', () => {
    const err = new Error('A title is required');
    render(<ActionError id="pbi-form-error" error={err} fallback="fallback" />);

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'pbi-form-error');
  });
});
