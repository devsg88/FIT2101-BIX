import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../config/db.js';
import { getBoard } from './boardModel.js';
import { getCompletedWorkByProject } from './completedWorkModel.js';

// NFR-02 / SCRUM-194. The NFR-02 baseline found NO N+1 query pattern: the
// project board and Completed Work History each run a fixed set of queries,
// however many PBIs, tasks and sub-tasks the project has (docs/performance/
// baseline.md and baseline-v2.md). These tests keep it that way: each read
// runs against a small and a much larger project, and the number of database
// calls must be the same for both. A per-item query added later - e.g. one
// query per PBI or per task inside a loop - makes the larger project issue
// more calls and fails here.
//
// The fake database answers each statement by the table it reads, so the
// tests do not depend on the exact SQL text or on which helper issues it.
vi.mock('../config/db.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

function buildProject({ pbis: pbiCount, tasksPerPbi, subTasksPerTask }) {
  const pbis = [];
  const tasks = [];
  const subTasks = [];
  for (let p = 1; p <= pbiCount; p += 1) {
    pbis.push({ id: p, project_id: 1, sprint_id: 1, title: `PBI ${p}`, stage: p % 2 ? 'completed' : 'active_sprint' });
    for (let t = 1; t <= tasksPerPbi; t += 1) {
      const taskId = tasks.length + 1;
      tasks.push({ id: taskId, pbi_id: p, title: `Task ${taskId}`, status: 'done' });
      for (let s = 1; s <= subTasksPerTask; s += 1) {
        subTasks.push({ id: subTasks.length + 1, task_id: taskId, title: 'Sub-task', status: 'done' });
      }
    }
  }
  return {
    project: { id: 1, name: 'Project' },
    sprints: [{ id: 1, project_id: 1, name: 'Sprint 1', status: 'completed' }],
    pbis,
    tasks,
    subTasks,
    collaborators: pbis.filter((pbi) => pbi.stage === 'completed').map((pbi) => ({ pbi_id: pbi.id, id: 9, name: 'Dev' }))
  };
}

// Answers a statement with the rows of the table it reads from.
function useFakeDatabase(data) {
  pool.query.mockImplementation(async (sql, params) => {
    const text = typeof sql === 'string' ? sql : sql.text;
    if (/FROM pbi_collaborators/i.test(text)) return { rows: data.collaborators };
    if (/FROM sub_tasks/i.test(text)) return { rows: data.subTasks };
    if (/FROM tasks/i.test(text)) return { rows: data.tasks };
    if (/FROM product_backlog_items/i.test(text)) {
      const stage = params?.find((value) => typeof value === 'string');
      return { rows: stage ? data.pbis.filter((pbi) => pbi.stage === stage) : data.pbis };
    }
    if (/FROM sprints/i.test(text)) return { rows: data.sprints };
    if (/FROM projects/i.test(text)) return { rows: [data.project] };
    return { rows: [] };
  });
}

function databaseCalls() {
  return pool.query.mock.calls.length + pool.connect.mock.calls.length;
}

const SMALL = { pbis: 2, tasksPerPbi: 1, subTasksPerTask: 1 };
const LARGE = { pbis: 200, tasksPerPbi: 4, subTasksPerTask: 2 }; // 800 tasks, 1,600 sub-tasks

describe('core project reads issue a fixed number of queries (no N+1)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function callsFor(read, shape) {
    vi.resetAllMocks();
    const data = buildProject(shape);
    useFakeDatabase(data);
    const result = await read(1);
    return { calls: databaseCalls(), result, data };
  }

  it('project board: the same number of queries for 2 PBIs as for 200 PBIs with 1,600 sub-tasks', async () => {
    const small = await callsFor(getBoard, SMALL);
    const large = await callsFor(getBoard, LARGE);

    expect(large.calls).toBe(small.calls);
    expect(small.calls).toBeGreaterThan(0);
    // The large board really was assembled from all of that data.
    expect(large.result.pbis).toHaveLength(200);
    expect(large.result.pbis.flatMap((pbi) => pbi.tasks)).toHaveLength(800);
    expect(large.result.pbis.flatMap((pbi) => pbi.tasks).flatMap((task) => task.subTasks)).toHaveLength(1600);
  });

  it('Completed Work History: the same number of queries however much work is completed', async () => {
    const small = await callsFor(getCompletedWorkByProject, SMALL);
    const large = await callsFor(getCompletedWorkByProject, LARGE);

    expect(large.calls).toBe(small.calls);
    expect(small.calls).toBeGreaterThan(0);
    expect(large.result.pbis).toHaveLength(100);
    expect(large.result.pbis.every((pbi) => pbi.collaborators.length === 1)).toBe(true);
    expect(large.result.pbis.flatMap((pbi) => pbi.tasks)).toHaveLength(400);
  });

  it('neither read opens extra connections per item', async () => {
    await callsFor(getBoard, LARGE);
    await callsFor(getCompletedWorkByProject, LARGE);

    expect(pool.connect).not.toHaveBeenCalled();
  });
});
