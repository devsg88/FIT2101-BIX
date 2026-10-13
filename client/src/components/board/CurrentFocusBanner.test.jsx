import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CurrentFocusBanner from './CurrentFocusBanner.jsx';

// US-07 (SCRUM-199). Only the stage labels are needed from the board
// context. The banner is display only; setting and clearing the focus is
// covered in ProductBacklog.focus.test.jsx.
vi.mock('../../context/BoardContext.jsx', () => ({
  STAGE_LABELS: {
    product_backlog: 'Product Backlog',
    sprint_planning: 'Sprint Planning',
    active_sprint: 'Active Sprint',
    completed: 'Completed'
  }
}));

const focusedPbi = { id: 7, title: 'Reset password', stage: 'active_sprint' };

describe('CurrentFocusBanner', () => {
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

  it('has no buttons - the Admin manages the focus on Manage Backlog', () => {
    render(<CurrentFocusBanner focusedPbi={focusedPbi} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
