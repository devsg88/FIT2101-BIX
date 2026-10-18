import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManageMembersModal from './ManageMembersModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  addProjectMember,
  getAvailableDevelopers,
  getProjectMembers,
  removeProjectMember
} from '../../services/api.js';

// US-03/US-05: the real "add/remove a developer from a project" UI - closes
// the gap the NFR-01 frontend audit found (TeamDetail.jsx's equivalent
// never persisted anything). Reuses that modal's markup/classes, tested
// here against the real api.js functions instead of mock data.
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({
  addProjectMember: vi.fn(),
  getAvailableDevelopers: vi.fn(),
  getProjectMembers: vi.fn(),
  removeProjectMember: vi.fn()
}));

const onClose = vi.fn();

function renderModal(projectId = 7) {
  useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok-admin' } });
  return render(<ManageMembersModal projectId={projectId} onClose={onClose} />);
}

const MEMBERS = [{ id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' }];
const AVAILABLE = [{ id: 5, name: 'New Dev', email: 'new@bix.app' }];

describe('ManageMembersModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectMembers.mockResolvedValue({ members: MEMBERS });
    getAvailableDevelopers.mockResolvedValue({ developers: AVAILABLE });
  });

  it('loads both lists with the project id and token on mount', async () => {
    renderModal();

    await waitFor(() => expect(getProjectMembers).toHaveBeenCalledWith(7, 'tok-admin'));
    expect(getAvailableDevelopers).toHaveBeenCalledWith(7, 'tok-admin');
  });

  it('shows current members and available developers once loaded', async () => {
    renderModal();

    expect(await screen.findByText('Pang')).toBeInTheDocument();
    expect(screen.getByText('pang@bix.app')).toBeInTheDocument();
    expect(screen.getByText('New Dev')).toBeInTheDocument();
    expect(screen.getByText('new@bix.app')).toBeInTheDocument();
  });

  it('shows an honest empty state when nobody is a member yet', async () => {
    getProjectMembers.mockResolvedValue({ members: [] });
    renderModal();

    expect(await screen.findByText('No developers are on this project yet.')).toBeInTheDocument();
  });

  it('shows an honest empty state when every developer is already on the project', async () => {
    getAvailableDevelopers.mockResolvedValue({ developers: [] });
    renderModal();

    expect(
      await screen.findByText('Every developer is already on this project.')
    ).toBeInTheDocument();
  });

  it('filters the available-developer list by search query', async () => {
    getAvailableDevelopers.mockResolvedValue({
      developers: [
        { id: 5, name: 'New Dev', email: 'new@bix.app' },
        { id: 6, name: 'Other Dev', email: 'other@bix.app' }
      ]
    });
    renderModal();
    await screen.findByText('New Dev');

    fireEvent.change(screen.getByLabelText('Search developers'), { target: { value: 'other' } });

    expect(screen.queryByText('New Dev')).not.toBeInTheDocument();
    expect(screen.getByText('Other Dev')).toBeInTheDocument();
  });

  it('adds a developer and refreshes both lists from the server', async () => {
    addProjectMember.mockResolvedValue({ members: [...MEMBERS, { id: 5, name: 'New Dev' }] });
    renderModal();
    await screen.findByText('New Dev');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(addProjectMember).toHaveBeenCalledWith(7, 5, 'tok-admin'));
    // Refetched, not locally patched - matches the BoardContext convention.
    expect(getProjectMembers).toHaveBeenCalledTimes(2);
    expect(getAvailableDevelopers).toHaveBeenCalledTimes(2);
  });

  it('removes a member and refreshes both lists from the server', async () => {
    removeProjectMember.mockResolvedValue({ members: [] });
    renderModal();
    await screen.findByText('Pang');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeProjectMember).toHaveBeenCalledWith(7, 1, 'tok-admin'));
    expect(getProjectMembers).toHaveBeenCalledTimes(2);
    expect(getAvailableDevelopers).toHaveBeenCalledTimes(2);
  });

  it('shows the backend error inline when adding fails, without closing the modal', async () => {
    addProjectMember.mockRejectedValue(new Error('Only developers can be added as project members'));
    renderModal();
    await screen.findByText('New Dev');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only developers can be added as project members'
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Done is clicked', async () => {
    renderModal();
    await screen.findByText('Pang');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalled();
  });
});
