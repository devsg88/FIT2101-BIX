import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard } from '../services/api.js';

// US-07 (SCRUM-199): the Current Focus banner and card highlight on the real
// Board page and BoardContext. Only the API and login are faked. The board
// only shows the focus - the Admin sets and clears it on Manage Backlog
// (ProductBacklog.focus.test.jsx).
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/projects/7/board']}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
      </Routes>
    </MemoryRouter>
  );
}

function boardWithFocus(focusId) {
  return {
    // pg returns bigint ids as strings, so the focus id is a string here.
    project: { id: '7', name: 'BIX Platform', current_focus_pbi_id: focusId },
    sprints: [],
    pbis: [
      { id: 1, title: 'Reset password', stage: 'active_sprint', tasks: [] },
      { id: 2, title: 'Upload photo', stage: 'product_backlog', tasks: [] }
    ]
  };
}

describe('Board page - Current Focus (US-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
  });

  it('shows no banner when the project has no focus', async () => {
    getBoard.mockResolvedValue(boardWithFocus(null));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument();
  });

  it('shows the focused PBI in the banner and highlights its card', async () => {
    getBoard.mockResolvedValue(boardWithFocus('1'));

    renderBoard();

    const banner = await screen.findByRole('region', { name: 'Current Focus' });
    expect(within(banner).getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
    expect(within(banner).getByText('Active Sprint')).toBeInTheDocument();
    const badge = screen.getByText('Current Focus', { selector: '.project-board__focus-badge' });
    expect(badge.closest('article')).toHaveClass('project-board__card--focused');
  });

  it('shows no banner if the focus points at a PBI that is not on the board', async () => {
    getBoard.mockResolvedValue(boardWithFocus('99'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument();
  });

  it.each([
    ['developer', null],
    ['developer', '1'],
    ['admin', null],
    ['admin', '1']
  ])('offers no Set as Focus or Clear Focus on the board (%s, focus %s)', async (role, focusId) => {
    useAuth.mockReturnValue({ user: { id: 1, role, token: 'tok' } });
    getBoard.mockResolvedValue(boardWithFocus(focusId));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Set as Focus/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear Focus/ })).not.toBeInTheDocument();
  });
});
