import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SprintEffortChart from './SprintEffortChart.jsx';

const sprints = [{ id: '1', name: 'Iteration' }, { id: '2', name: 'Iteration' }, { id: '3', name: 'Future' }];
const developers = [{ id: '7', name: 'Alex' }, { id: '8', name: 'Alex' }];

describe('SprintEffortChart', () => {
  it('labels duplicate Sprint/developer names using ids and uses a common scale', () => {
    render(<SprintEffortChart sprints={sprints} developers={developers} effort={[
      { sprint_id: '1', developer_id: '7', actual_hours: 2, recorded_items: 1, missing_actual_hours: 0 },
      { sprint_id: '2', developer_id: '8', actual_hours: 4, recorded_items: 1, missing_actual_hours: 0 }
    ]} />);
    const first = screen.getByRole('img', { name: 'Alex (#7), Iteration (#1): 2 actual hours' });
    const second = screen.getByRole('img', { name: 'Alex (#8), Iteration (#2): 4 actual hours' });
    expect(first.querySelector('.sprint-effort__bar')).toHaveStyle({ width: '50%' });
    expect(second.querySelector('.sprint-effort__bar')).toHaveStyle({ width: '100%' });
    expect(screen.getByRole('img', { name: 'Alex (#7), Future (#3): 0 actual hours' })).toBeInTheDocument();
  });

  it('distinguishes missing Actual Hours from a genuine zero-record Sprint', () => {
    render(<SprintEffortChart sprints={sprints} developers={[developers[0]]} effort={[
      { sprint_id: '1', developer_id: '7', actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 }
    ]} />);
    expect(screen.getByRole('img', { name: /Iteration \(#1\): Actual Hours not recorded/ })).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Alex (#7), Iteration (#2): 0 actual hours' })).toBeInTheDocument();
  });
});
