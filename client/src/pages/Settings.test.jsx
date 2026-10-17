import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
// AdminSidebar loads the Admin's projects on mount - mocked here purely so
// Settings can render in isolation, same convention as other admin pages.
vi.mock('../services/api.js', () => ({
  getResponsibleProjects: vi.fn(() => Promise.resolve({ projects: [] }))
}));

function renderSettings(user = { id: 3, name: 'Admin', role: 'admin', token: 'tok' }) {
  useAuth.mockReturnValue({ user, logout: vi.fn() });
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings page', () => {
  it('shows the logged-in Admin\'s real name and role, not invented fields', () => {
    renderSettings({ id: 3, name: 'Jordan Lee', role: 'admin', token: 'tok' });

    expect(screen.getByRole('heading', { name: 'System Settings' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows a "coming soon" note rather than fabricated settings controls', () => {
    renderSettings();

    expect(screen.getByText('More settings are coming soon.')).toBeInTheDocument();
  });
});
