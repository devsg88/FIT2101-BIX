import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard, updateProjectFocus } from '../services/api.js';

// US-07 (SCRUM-199): the Current Focus banner and Set as Focus button on the
// real Board page and BoardContext. Only the API and login are faked.
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

// The Set as Focus button on the card with this title.
function focusButtonOn(title) {
  const card = screen.getByRole('heading', { name: title }).closest('article');
  return within(card).getByRole('button', { name: 'Set as Focus' });
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
    updateProjectFocus.mockResolvedValue({ project: { id: '7' } });
  });

  it('shows no banner when the project has no focus', async () => {
    getBoard.mockResolvedValue(boardWithFocus(null));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Set as Focus' })).toHaveLength(2);
  });

  it('shows the focused PBI in the banner and highlights its card', async () => {
    getBoard.mockResolvedValue(boardWithFocus('1'));

    renderBoard();

    const banner = await screen.findByRole('region', { name: 'Current Focus' });
    expect(within(banner).getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
    expect(within(banner).getByText('Active Sprint')).toBeInTheDocument();
    // The focused card gets a badge instead of a Set as Focus button.
    expect(screen.getAllByRole('button', { name: 'Set as Focus' })).toHaveLength(1);
    expect(screen.getByText('Current Focus', { selector: '.project-board__focus-badge' }))
      .toBeInTheDocument();
  });

  it('shows no banner if the focus points at a PBI that is not on the board', async () => {
    getBoard.mockResolvedValue(boardWithFocus('99'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument();
  });

  it('sets the focus from a card, then refreshes the board to show it', async () => {
    getBoard
      .mockResolvedValueOnce(boardWithFocus(null))
      .mockResolvedValueOnce(boardWithFocus('2'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    fireEvent.click(focusButtonOn('Upload photo'));

    await waitFor(() => expect(updateProjectFocus).toHaveBeenCalledWith('7', 2, 'tok'));
    const banner = await screen.findByRole('region', { name: 'Current Focus' });
    expect(within(banner).getByRole('heading', { name: 'Upload photo' })).toBeInTheDocument();
    expect(getBoard).toHaveBeenCalledTimes(2);
  });

  it('sends the PBI id as a number when pg returns it as a string', async () => {
    const board = boardWithFocus(null);
    board.pbis = board.pbis.map((pbi) => ({ ...pbi, id: String(pbi.id) }));
    getBoard.mockResolvedValue(board);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    fireEvent.click(focusButtonOn('Upload photo'));

    await waitFor(() => expect(updateProjectFocus).toHaveBeenCalledWith('7', 2, 'tok'));
  });

  it('clears the focus from the banner, then hides it after the refresh', async () => {
    getBoard
      .mockResolvedValueOnce(boardWithFocus('1'))
      .mockResolvedValueOnce(boardWithFocus(null));

    renderBoard();

    fireEvent.click(await screen.findByRole('button', { name: 'Clear Focus' }));

    await waitFor(() => expect(updateProjectFocus).toHaveBeenCalledWith('7', null, 'tok'));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument()
    );
  });

  it('shows the server message on the card when setting the focus fails', async () => {
    getBoard.mockResolvedValue(boardWithFocus(null));
    updateProjectFocus.mockRejectedValue(new Error('PBI not found in this project'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    fireEvent.click(focusButtonOn('Reset password'));

    expect(await screen.findByRole('alert')).toHaveTextContent('PBI not found in this project');
    expect(screen.queryByRole('region', { name: 'Current Focus' })).not.toBeInTheDocument();
  });
});
