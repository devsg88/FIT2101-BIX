import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from './ResetPassword.jsx';
import { resetPassword } from '../services/api.js';

vi.mock('../services/api.js', () => ({
  resetPassword: vi.fn()
}));

function renderPage(search = '?token=valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPassword />
    </MemoryRouter>
  );
}

describe('ResetPassword page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a short password before calling the API', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('shows the server error for an expired token and offers another reset', async () => {
    resetPassword.mockRejectedValue(
      new Error('This reset link is invalid or has expired. You can request another reset.')
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'newpass12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('request another reset');
    });
    expect(screen.getByRole('link', { name: 'Request another reset' }).getAttribute('href')).toBe(
      '/forgot-password'
    );
  });

  it('submits a matching password with the token from the URL', async () => {
    resetPassword.mockResolvedValue({
      message: 'Your password has been reset. You can now sign in with the new password.'
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'newpass12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        password: 'newpass12',
        confirm_password: 'newpass12'
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('sign in');
  });
});
