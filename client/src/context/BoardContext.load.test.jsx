import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BoardProvider, useBoard } from './BoardContext.jsx';
import { useAuth } from './AuthContext.jsx';
import { getBoard, getProjectMembers } from '../services/api.js';

vi.mock('./AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

// NFR-02. The board and the project's members are loaded together rather than
// one after the other, while the board alone still decides whether the page
// is ready, failed (Retry) or forbidden (AccessDenied).

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const BOARD = { project: { id: 1, name: 'BIX Platform' }, pbis: [], sprints: [] };
const MEMBERS = { members: [{ id: '2', name: 'Dev A' }, { id: '3', name: 'Dev B' }] };

function Probe() {
  const { status, error, project, members, reloadBoard } = useBoard();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="project">{project?.name ?? ''}</p>
      <p data-testid="members">{members.length}</p>
      {error && <p data-testid="error">{error}</p>}
      <button type="button" onClick={reloadBoard}>Retry</button>
    </div>
  );
}

function renderBoard() {
  return render(
    <BoardProvider projectId="1">
      <Probe />
    </BoardProvider>
  );
}

const statusText = () => screen.getByTestId('status').textContent;

describe('BoardContext board + members loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });
  });

  it('starts both requests before either has answered', async () => {
    const board = deferred();
    const members = deferred();
    getBoard.mockReturnValue(board.promise);
    getProjectMembers.mockReturnValue(members.promise);

    renderBoard();

    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(1));
    // Neither request has been answered yet, and the members request is
    // already in flight - it no longer waits for the board.
    expect(getProjectMembers).toHaveBeenCalledTimes(1);
    expect(getProjectMembers).toHaveBeenCalledWith('1', 'tok');
    expect(statusText()).toBe('loading');

    // Answers can arrive in either order.
    await act(async () => members.resolve(MEMBERS));
    await act(async () => board.resolve(BOARD));
    expect(statusText()).toBe('ready');
    expect(screen.getByTestId('members').textContent).toBe('2');
  });

  it('shows the board as soon as it arrives, even while members are still loading', async () => {
    const members = deferred();
    getBoard.mockResolvedValue(BOARD);
    getProjectMembers.mockReturnValue(members.promise);

    renderBoard();

    await waitFor(() => expect(statusText()).toBe('ready'));
    expect(screen.getByTestId('project').textContent).toBe('BIX Platform');
    expect(screen.getByTestId('members').textContent).toBe('0');

    await act(async () => members.resolve(MEMBERS));
    expect(screen.getByTestId('members').textContent).toBe('2');
  });

  it('keeps the board usable when the members request fails', async () => {
    getBoard.mockResolvedValue(BOARD);
    getProjectMembers.mockRejectedValue(Object.assign(new Error('Could not reach the server.'), { status: 0 }));

    renderBoard();

    await waitFor(() => expect(statusText()).toBe('ready'));
    expect(screen.getByTestId('project').textContent).toBe('BIX Platform');
    expect(screen.getByTestId('members').textContent).toBe('0');
    expect(screen.queryByTestId('error')).not.toBeInTheDocument();
  });

  it('a 403 on the board still means forbidden, whatever the members request did', async () => {
    getBoard.mockRejectedValue(Object.assign(new Error('You are not a member of this project'), { status: 403 }));
    getProjectMembers.mockResolvedValue(MEMBERS);

    renderBoard();

    await waitFor(() => expect(statusText()).toBe('forbidden'));
    expect(screen.getByTestId('members').textContent).toBe('0');
  });

  it('a transient board failure stays retryable, and Retry loads both once more', async () => {
    getBoard
      .mockRejectedValueOnce(Object.assign(new Error('Could not reach the server.'), { status: 0 }))
      .mockResolvedValueOnce(BOARD);
    getProjectMembers.mockResolvedValue(MEMBERS);

    renderBoard();

    await waitFor(() => expect(statusText()).toBe('error'));
    expect(screen.getByTestId('error').textContent).toBe('Could not reach the server.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(statusText()).toBe('ready'));
    expect(screen.getByTestId('members').textContent).toBe('2');
    // One board and one members request per load - no duplicates.
    expect(getBoard).toHaveBeenCalledTimes(2);
    expect(getProjectMembers).toHaveBeenCalledTimes(2);
  });
});
