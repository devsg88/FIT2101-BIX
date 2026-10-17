import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
// AdminSidebar (rendered for the Admin view) loads the Admin's projects on
// mount - mocked here purely so Settings can render in isolation, same
// convention as other admin pages.
vi.mock('../services/api.js', () => ({
  getResponsibleProjects: vi.fn(() => Promise.resolve({ projects: [] }))
}));

function renderSettings(user, logout = vi.fn()) {
  useAuth.mockReturnValue({ user, logout });
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings page - Admin view', () => {
  it("shows the logged-in Admin's real name and role, not invented fields", () => {
    renderSettings({ id: 3, name: 'Jordan Lee', role: 'admin', token: 'tok' });

    expect(screen.getByRole('heading', { name: 'System Settings' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows a "coming soon" note rather than fabricated settings controls', () => {
    renderSettings({ id: 3, name: 'Admin', role: 'admin', token: 'tok' });

    expect(screen.getByText('More settings are coming soon.')).toBeInTheDocument();
  });

  it('shows the AdminSidebar (org navigation), not the Developer topbar', () => {
    renderSettings({ id: 3, name: 'Admin', role: 'admin', token: 'tok' });

    expect(screen.getByRole('link', { name: 'Organization Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /My Project/i })).not.toBeInTheDocument();
  });
});

// US-16 (T16.2): the same /settings route now renders a Developer-specific
// account view - own name/role only, no AdminSidebar, no org content.
describe('Settings page - Developer view (US-16)', () => {
  it("shows the logged-in Developer's real name and role, not invented fields", () => {
    renderSettings({ id: 7, name: 'Sam Rivers', role: 'developer', token: 'tok' });

    expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument();
    // "Sam Rivers" also appears in the topbar's own user-profile widget, so
    // this scopes to the account-details card specifically.
    const accountSection = screen.getByRole('heading', { name: 'Your account' }).closest('section');
    expect(accountSection).toHaveTextContent('Sam Rivers');
    expect(accountSection).toHaveTextContent('Developer');
  });

  it('shows a "coming soon" note rather than fabricated settings controls', () => {
    renderSettings({ id: 7, name: 'Sam Rivers', role: 'developer', token: 'tok' });

    expect(screen.getByText('More settings are coming soon.')).toBeInTheDocument();
  });

  it('shows the Developer topbar (Dashboard/My Project nav), not the AdminSidebar', () => {
    renderSettings({ id: 7, name: 'Sam Rivers', role: 'developer', token: 'tok' });

    expect(screen.getByRole('link', { name: /DashBoard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /My Project/i })).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('link', { name: 'Organization Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search teams')).not.toBeInTheDocument();
  });

  it('never shows the Admin-only System Settings heading or org content', () => {
    renderSettings({ id: 7, name: 'Sam Rivers', role: 'developer', token: 'tok' });

    expect(screen.queryByRole('heading', { name: 'System Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your projects')).not.toBeInTheDocument();
  });

  it('signs out through the user menu, same as the rest of the Developer pages', () => {
    const logout = vi.fn();
    renderSettings({ id: 7, name: 'Sam Rivers', role: 'developer', token: 'tok' }, logout);

    fireEvent.click(screen.getByRole('button', { name: /Sam Rivers/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(logout).toHaveBeenCalled();
  });
});
