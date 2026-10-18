import { describe, expect, it } from 'vitest';
import { buildSprintAnalytics } from './analytics.js';

const sprints = [
  { id: '10', name: 'Iteration', status: 'completed' },
  { id: '11', name: 'Iteration', status: 'active' },
  { id: '12', name: 'Empty Sprint', status: 'planning' }
];
const total = (overrides = {}) => ({
  sprint_id: '10', developer_id: '7', developer_name: 'Alex', actual_hours: '4.25',
  recorded_items: '2', missing_actual_hours: '0', ...overrides
});

describe('buildSprintAnalytics', () => {
  it('keeps same-name Sprints and developers distinct by id', () => {
    const data = buildSprintAnalytics(sprints, [total(), total({ sprint_id: '11', actual_hours: '2.5' }),
      total({ developer_id: '8', actual_hours: '1' })]);
    expect(data.sprints.map((sprint) => sprint.id)).toEqual(['10', '11', '12']);
    expect(data.developers).toEqual([{ id: '7', name: 'Alex' }, { id: '8', name: 'Alex' }]);
    expect(data.effort.map((point) => [point.sprint_id, point.developer_id, point.actual_hours]))
      .toEqual([['10', '7', 4.25], ['11', '7', 2.5], ['10', '8', 1]]);
  });

  it('supports bigint strings without losing id precision', () => {
    const id = '9007199254740993';
    const data = buildSprintAnalytics([{ id, name: 'Large id' }], [total({ sprint_id: id, developer_id: id })]);
    expect(data.effort[0]).toMatchObject({ sprint_id: id, developer_id: id });
  });

  it('keeps missing-hour counts rather than claiming they are recorded zeroes', () => {
    const data = buildSprintAnalytics(sprints, [total({ actual_hours: '0', recorded_items: '0', missing_actual_hours: '2' })]);
    expect(data.effort[0]).toMatchObject({ actual_hours: 0, recorded_items: 0, missing_actual_hours: 2 });
  });

  it('keeps unallocated work separate and combines records with no Sprint safely', () => {
    const data = buildSprintAnalytics(sprints, [total({ developer_id: null, actual_hours: '0.1' }),
      total({ developer_id: null, actual_hours: '0.2' }),
      total({ sprint_id: null }), total({ sprint_id: null, developer_id: '8' })]);
    expect(data.effort).toEqual([]);
    expect(data.developers).toEqual([]);
    expect(data.unattributed).toEqual([
      { sprint_id: '10', actual_hours: 0.3, recorded_items: 4, missing_actual_hours: 0 },
      { sprint_id: null, actual_hours: 8.5, recorded_items: 4, missing_actual_hours: 0 }
    ]);
  });

  it('retains empty Sprints and handles a completely empty project', () => {
    expect(buildSprintAnalytics(sprints, []).sprints).toHaveLength(3);
    expect(buildSprintAnalytics([], [])).toEqual({ sprints: [], developers: [], effort: [], unattributed: [] });
  });
});
