import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as controllers from './breakdownController.js';
import * as tasks from '../models/taskModel.js';
import { getPbiById } from '../models/pbiModel.js';
import { getPbiBreakdown } from '../models/boardModel.js';

vi.mock('../models/taskModel.js');
vi.mock('../models/pbiModel.js');
vi.mock('../models/boardModel.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const cases = [
  ['createTask', 'pbiId', getPbiById, 'task', false],
  ['updateTask', 'taskId', tasks.getTaskById, 'task', true],
  ['createSubTask', 'taskId', tasks.getTaskById, 'subTask', false],
  ['updateSubTask', 'subTaskId', tasks.getSubTaskById, 'subTask', true]
];

describe.each(cases)('%sController', (name, idKey, read, key, editing) => {
  let req;
  beforeEach(() => {
    vi.resetAllMocks();
    req = { params: { projectId: '7', [idKey]: '10' }, body: { title: '  Work  ', description: '  Details  ' } };
    read.mockResolvedValue({ id: 10, stage: 'sprint_planning', pbi_stage: 'sprint_planning', title: 'Old', description: 'Keep' });
    tasks[name].mockResolvedValue({ id: 11, title: 'Work', description: 'Details' });
  });

  it('saves validated fields in the requested project', async () => {
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(read).toHaveBeenCalledWith(7, 10);
    expect(tasks[name]).toHaveBeenCalledWith(7, 10, { title: 'Work', description: 'Details' });
    expect(res.status).toHaveBeenCalledWith(editing ? 200 : 201);
    expect(res.json).toHaveBeenCalledWith({ [key]: { id: 11, title: 'Work', description: 'Details' } });
  });

  it.each(['', '   ', null, 42])('rejects an invalid title: %s', async (title) => {
    req.body.title = title;
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tasks[name]).not.toHaveBeenCalled();
  });

  it('rejects a non-text description', async () => {
    req.body.description = {};
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tasks[name]).not.toHaveBeenCalled();
  });

  it.each(['product_backlog', 'active_sprint', 'completed'])('rejects writes in %s', async (stage) => {
    read.mockResolvedValue({ stage, pbi_stage: stage });
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tasks[name]).not.toHaveBeenCalled();
  });

  it('rejects a missing or cross-project parent', async () => {
    read.mockResolvedValue(null);
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(tasks[name]).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'bad', '9007199254740992'])('rejects invalid ids: %s', async (id) => {
    req.params[idKey] = id;
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns a conflict if the PBI leaves planning during the request', async () => {
    tasks[name].mockResolvedValue(null);
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('does not leak database errors', async () => {
    tasks[name].mockRejectedValue(new Error('internal SQL'));
    const res = response();
    await controllers[`${name}Controller`](req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('internal SQL');
  });

  if (editing) {
    it('preserves omitted fields and ignores relationship/completion changes', async () => {
      req.body = { description: null, pbi_id: 999, task_id: 999, status: 'done', actual_hours: 12 };
      await controllers[`${name}Controller`](req, response());
      expect(tasks[name]).toHaveBeenCalledWith(7, 10, { title: 'Old', description: null });
    });
    it('rejects an empty patch', async () => {
      req.body = {};
      const res = response();
      await controllers[`${name}Controller`](req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(tasks[name]).not.toHaveBeenCalled();
    });
  } else {
    it('accepts an omitted description', async () => {
      req.body = { title: 'Work' };
      await controllers[`${name}Controller`](req, response());
      expect(tasks[name]).toHaveBeenCalledWith(7, 10, { title: 'Work', description: null });
    });
  }
});

describe('getPbiBreakdownController', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns the existing PBI and its hierarchy in any stage', async () => {
    const pbi = { id: '10', stage: 'completed', tasks: [{ id: '11', subTasks: [{ id: '12' }] }] };
    getPbiBreakdown.mockResolvedValue(pbi);
    const res = response();
    await controllers.getPbiBreakdownController({ params: { projectId: '7', pbiId: '10' } }, res);
    expect(getPbiBreakdown).toHaveBeenCalledWith(7, 10);
    expect(res.json).toHaveBeenCalledWith({ pbi });
  });
  it('returns 404 for a missing or cross-project PBI', async () => {
    getPbiBreakdown.mockResolvedValue(null);
    const res = response();
    await controllers.getPbiBreakdownController({ params: { projectId: '7', pbiId: '10' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
