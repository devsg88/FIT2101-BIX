import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EffortChart from './EffortChart.jsx';

const groups = [{ id: '1', name: 'Platform' }, { id: '2', name: 'Platform' }, { id: '3', name: 'Empty' }];
const developers = [{ id: '7', name: 'Alex' }, { id: '8', name: 'Alex' }];

describe('Project effort using the shared chart', () => {
  it('distinguishes project and developer IDs, shares a scale and displays empty projects as zero', () => {
    render(<EffortChart groups={groups} groupKey="project_id" developers={developers} effort={[
      { project_id: '1', developer_id: '7', actual_hours: 2, recorded_items: 1, missing_actual_hours: 0 },
      { project_id: '2', developer_id: '8', actual_hours: 4, recorded_items: 1, missing_actual_hours: 0 }
    ]} />);
    expect(screen.getByRole('img', { name: 'Alex (#7), Platform (#1): 2 actual hours' }).querySelector('.sprint-effort__bar'))
      .toHaveStyle({ width: '50%' });
    expect(screen.getByRole('img', { name: 'Alex (#8), Platform (#2): 4 actual hours' }).querySelector('.sprint-effort__bar'))
      .toHaveStyle({ width: '100%' });
    expect(screen.getByRole('img', { name: 'Alex (#7), Empty (#3): 0 actual hours' })).toBeInTheDocument();
  });

  it('distinguishes missing Actual Hours from zero-record work', () => {
    render(<EffortChart groups={groups} groupKey="project_id" developers={[developers[0]]} effort={[
      { project_id: '1', developer_id: '7', actual_hours: 0, recorded_items: 0, missing_actual_hours: 2 }
    ]} />);
    expect(screen.getByRole('img', { name: /Platform \(#1\): Actual Hours not recorded/ })).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });
});
