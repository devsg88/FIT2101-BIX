import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductBacklog from './ProductBacklog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectPbis, updateProjectFocus } from '../services/api.js';

// US-07 (SCRUM-199): the Admin sets and clears the project's Current Focus
// from Manage Backlog. Only the API and login are faked.
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js', () => ({
  getProjectPbis: vi.fn(),
  updateProjectFocus: vi.fn(),
  createPbi: vi.fn(),
  updatePbi: vi.fn(),
  deletePbi: vi.fn()
}));

function renderBacklog() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/backlog']}>
      <Routes>
        <Route path="/projects/:projectId/backlog" element={<ProductBacklog />} />
      </Routes>
    </MemoryRouter>
  );
}

// pg returns bigint ids as strings, so every id here is a string too.
function backlogWithFocus(focusId) {
  return {
    pbis: [
      { id: '1', title: 'Reset password', stage: 'product_backlog' },
      { id: '2', title: 'Upload photo', stage: 'sprint_planning' }
    ],
    current_focus_pbi_id: focusId
  };
}

function rowFor(title) {
  return screen.getByText(title).closest('li');
}

describe('ProductBacklog page - Current Focus (US-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });
    updateProjectFocus.mockResolvedValue({ project: { id: '1' } });
  });

  it('offers Set as Focus on every row when the project has no focus', async () => {
    getProjectPbis.mockResolvedValue(backlogWithFocus(null));

    renderBacklog();

    await screen.findByText('Reset password');
    expect(screen.getAllByRole('button', { name: /^Set as Focus/ })).toHaveLength(2);
    expect(screen.queryByText('Current Focus')).not.toBeInTheDocument();
  });

  it('marks the focused row with a badge and offers Clear Focus on it', async () => {
    getProjectPbis.mockResolvedValue(backlogWithFocus('2'));

    renderBacklog();

    await screen.findByText('Upload photo');
    const focused = rowFor('Upload photo');
    expect(within(focused).getByText('Current Focus')).toBeInTheDocument();
    expect(within(focused).getByRole('button', { name: 'Clear Focus: Upload photo' }))
      .toBeInTheDocument();
    expect(within(rowFor('Reset password')).queryByText('Current Focus')).not.toBeInTheDocument();
  });

  it('sets the focus as a number, then shows it after refreshing the list', async () => {
    getProjectPbis
      .mockResolvedValueOnce(backlogWithFocus(null))
      .mockResolvedValueOnce(backlogWithFocus('1'));

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Set as Focus: Reset password' }));

    await waitFor(() => expect(updateProjectFocus).toHaveBeenCalledWith('1', 1, 'tok'));
    await waitFor(() =>
      expect(within(rowFor('Reset password')).getByText('Current Focus')).toBeInTheDocument()
    );
    expect(getProjectPbis).toHaveBeenCalledTimes(2);
  });

  it('clears the focus with null, then removes the badge', async () => {
    getProjectPbis
      .mockResolvedValueOnce(backlogWithFocus('1'))
      .mockResolvedValueOnce(backlogWithFocus(null));

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Clear Focus: Reset password' }));

    await waitFor(() => expect(updateProjectFocus).toHaveBeenCalledWith('1', null, 'tok'));
    await waitFor(() => expect(screen.queryByText('Current Focus')).not.toBeInTheDocument());
  });

  it('shows the server message on the row when setting the focus fails', async () => {
    getProjectPbis.mockResolvedValue(backlogWithFocus(null));
    updateProjectFocus.mockRejectedValue(new Error('PBI not found in this project'));

    renderBacklog();

    fireEvent.click(await screen.findByRole('button', { name: 'Set as Focus: Upload photo' }));

    const alert = await within(rowFor('Upload photo')).findByRole('alert');
    expect(alert).toHaveTextContent('PBI not found in this project');
    expect(within(rowFor('Upload photo')).queryByText('Current Focus')).not.toBeInTheDocument();
  });
});
