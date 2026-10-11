import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CurrentFocusBanner from './CurrentFocusBanner.jsx';
import { useBoard } from '../../context/BoardContext.jsx';

// US-07 (SCRUM-199). The board context is faked so the banner can be tested
// on its own; the real save-then-refresh is covered through Board.jsx.
vi.mock('../../context/BoardContext.jsx', () => ({
  useBoard: vi.fn(),
  STAGE_LABELS: {
    product_backlog: 'Product Backlog',
    sprint_planning: 'Sprint Planning',
    active_sprint: 'Active Sprint',
    completed: 'Completed'
  }
}));

const focusedPbi = { id: 7, title: 'Reset password', stage: 'active_sprint' };

describe('CurrentFocusBanner', () => {
  let setProjectFocus;

  beforeEach(() => {
    vi.clearAllMocks();
    setProjectFocus = vi.fn().mockResolvedValue(undefined);
    useBoard.mockReturnValue({ setProjectFocus });
  });

  it.each([
    ['null', null],
    ['undefined', undefined]
  ])('renders nothing when focusedPbi is %s', (_label, value) => {
    const { container } = render(<CurrentFocusBanner focusedPbi={value} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the focused PBI title, priority and status', () => {
    render(<CurrentFocusBanner focusedPbi={{ ...focusedPbi, priority: 'high' }} />);

    expect(screen.getByRole('region', { name: 'Current Focus' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Active Sprint')).toBeInTheDocument();
  });

  it('shows "Not set" while PBIs have no priority', () => {
    render(<CurrentFocusBanner focusedPbi={focusedPbi} />);

    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('clears the focus by saving null when Clear Focus is clicked', async () => {
    render(<CurrentFocusBanner focusedPbi={focusedPbi} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Focus' }));

    await waitFor(() => expect(setProjectFocus).toHaveBeenCalledWith(null));
  });

  it('disables the button while clearing', async () => {
    let finish;
    setProjectFocus.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<CurrentFocusBanner focusedPbi={focusedPbi} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Focus' }));

    expect(await screen.findByRole('button', { name: 'Clearing...' })).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear Focus' })).toBeEnabled()
    );
  });

  it('shows the server message when clearing fails, and keeps the banner', async () => {
    setProjectFocus.mockRejectedValue(new Error('You are not a member of this project'));
    render(<CurrentFocusBanner focusedPbi={focusedPbi} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Focus' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not a member of this project'
    );
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
  });
});
