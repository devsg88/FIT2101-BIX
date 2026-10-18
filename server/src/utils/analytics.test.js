import { describe, expect, it } from 'vitest';
import { buildSprintAnalytics, buildProjectAnalytics } from './analytics.js';

const sprints = [
  { id: '10', name: 'Iteration', status: 'completed' },
  { id: '11', name: 'Iteration', status: 'active' },
  { id: '12', name: 'Empty Sprint', status: 'planning' }
];
const total = (overrides = {}) => ({
  sprint_id: '10', developer_id: '7', developer_name: 'Alex', actual_hours: '4.25',
  recorded_items: '2', missing_actual_hours: '0', ...overrides
});

describe('buildProjectAnalytics', () => {
  const projects = [{ id: '1', name: 'Same project name' }, { id: '2', name: 'Same project name' }, { id: '3', name: 'Empty' }];
  const row = (overrides = {}) => ({ project_id: '1', developer_id: '7', developer_name: 'Alex',
    actual_hours: '4.25', recorded_items: '2', missing_actual_hours: '0', ...overrides });

  it('preserves distinct project/developer IDs and empty projects', () => {
    const data = buildProjectAnalytics(projects, [row(), row({ project_id: '2', actual_hours: '2.5' }), row({ developer_id: '8' })]);
    expect(data.projects).toEqual(projects);
    expect(data.developers).toHaveLength(2);
    expect(data.effort.map((point) => [point.project_id, point.developer_id, point.actual_hours]))
      .toEqual([['1','7',4.25],['2','7',2.5],['1','8',4.25]]);
  });

  it('does not require a Sprint to attribute recorded project work', () => {
    expect(buildProjectAnalytics(projects, [row({ sprint_id: null })]).effort[0].actual_hours).toBe(4.25);
  });

  it('retains missing-hour counts without treating them as recorded zero effort', () => {
    expect(buildProjectAnalytics(projects, [row({ actual_hours: '0', recorded_items: '0', missing_actual_hours: '1' })]).effort[0])
      .toMatchObject({ actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 });
  });

  it('combines unallocated records only within their own project', () => {
    const data = buildProjectAnalytics(projects, [row({ developer_id: null, actual_hours: '0.1' }),
      row({ developer_id: null, actual_hours: '0.2' }), row({ project_id: '2', developer_id: null, missing_actual_hours: '1' })]);
    expect(data.effort).toEqual([]);
    expect(data.unattributed).toEqual([
      { project_id: '1', actual_hours: 0.3, recorded_items: 4, missing_actual_hours: 0 },
      { project_id: '2', actual_hours: 4.25, recorded_items: 2, missing_actual_hours: 1 }
    ]);
  });

  it('discards out-of-scope rows instead of leaking names or unattributed hours', () => {
    const data = buildProjectAnalytics(projects, [row({ project_id: '99', developer_name: 'Private' }),
      row({ project_id: '99', developer_id: null })]);
    expect(data.developers).toEqual([]);
    expect(data.effort).toEqual([]);
    expect(data.unattributed).toEqual([]);
  });

  it('keeps bigint IDs as strings without precision loss', () => {
    const id = '9007199254740993';
    expect(buildProjectAnalytics([{ id, name: 'Large ID' }], [row({ project_id: id, developer_id: id })]).effort[0])
      .toMatchObject({ project_id: id, developer_id: id });
  });

  it('handles an admin with no responsible projects', () => {
    expect(buildProjectAnalytics([], [])).toEqual({ projects: [], developers: [], effort: [], unattributed: [] });
  });
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
