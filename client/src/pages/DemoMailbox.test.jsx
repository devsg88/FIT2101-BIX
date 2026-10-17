import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemoMailbox from './DemoMailbox.jsx';
import { getDemoMailbox } from '../services/api.js';

vi.mock('../services/api.js', () => ({
  getDemoMailbox: vi.fn()
}));

describe('DemoMailbox page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a delivered reset message with an openable link', async () => {
    getDemoMailbox.mockResolvedValue({
      messages: [{
        id: 1,
        to: 'developer@bix.app',
        subject: 'Reset your BIX password',
        body: 'Use the link',
        resetUrl: 'http://localhost:5173/reset-password?token=abc'
      }]
    });
    render(
      <MemoryRouter>
        <DemoMailbox />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('developer@bix.app')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open reset link' })).toHaveAttribute(
      'href',
      'http://localhost:5173/reset-password?token=abc'
    );
  });
});
