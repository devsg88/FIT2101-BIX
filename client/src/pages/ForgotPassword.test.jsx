import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword.jsx';
import { requestPasswordReset } from '../services/api.js';

vi.mock('../services/api.js', () => ({
  requestPasswordReset: vi.fn()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

describe('ForgotPassword page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a valid email before calling the API', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows the generic confirmation returned by the server', async () => {
    requestPasswordReset.mockResolvedValue({
      message: 'If an account exists for that email, we have sent password reset instructions.'
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'developer@bix.app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('If an account exists');
    });
    expect(requestPasswordReset).toHaveBeenCalledWith('developer@bix.app');
    expect(screen.getByRole('link', { name: 'Open demo inbox' })).toHaveAttribute(
      'href',
      '/demo-mailbox'
    );
  });

  it('links back to sign in', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
});
