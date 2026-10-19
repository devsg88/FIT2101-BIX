import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { getProjectResponsibility } from '../models/projectModel.js';
import { getPbiById } from '../models/pbiModel.js';
import { getTaskInPbi, updateTaskInPbi as updateTask, deleteTask, deleteTaskWithSubTasks, assignTask } from '../models/taskModel.js';
import {
  getSubTaskById,
  updateSubTask,
  deleteSubTask,
  deleteSubTasksByTaskId,
  assignSubTask
} from '../models/subTaskModel.js';
import { listProjectMembers } from '../models/projectMembershipModel.js';

// US-04a AC 5 ("an admin cannot manage Tasks or Sub-tasks in projects they
// are not responsible for"), proved end to end through the real app: the six
// Admin mutation routes run requireAuth -> requireRole('admin') ->
// requireProjectResponsibility (US-04d) before their controllers. Only the
// database-backed models are faked. requireProjectResponsibility's own
// behaviour is unit-tested in authMiddleware.test.js; what is tested here is
// that US-04a's routes actually use it, and that a refused request never
// reaches a write.
vi.mock('../models/projectModel.js');
vi.mock('../models/pbiModel.js');
vi.mock('../models/taskModel.js');
vi.mock('../models/subTaskModel.js');
vi.mock('../models/projectMembershipModel.js');

const TASK = '/api/projects/1/pbis/2/tasks/3';
const SUB_TASK = `${TASK}/sub-tasks/4`;

// The six US-04a Admin mutation routes, each with a valid body and the model
// write it ends in.
const ROUTES = [
  { label: 'edit task', method: 'PATCH', path: TASK, body: { title: 'Renamed', status: 'in_progress' }, write: () => updateTask },
  { label: 'delete task', method: 'DELETE', path: TASK, write: () => deleteTaskWithSubTasks },
  { label: 'assign task', method: 'PATCH', path: `${TASK}/assignee`, body: { assignee_id: 2 }, write: () => assignTask },
  { label: 'edit sub-task', method: 'PATCH', path: SUB_TASK, body: { title: 'Renamed', status: 'in_progress' }, write: () => updateSubTask },
  { label: 'delete sub-task', method: 'DELETE', path: SUB_TASK, write: () => deleteSubTask },
  { label: 'assign sub-task', method: 'PATCH', path: `${SUB_TASK}/assignee`, body: { assignee_id: 2 }, write: () => assignSubTask }
];

const WRITES = () => [updateTask, deleteTask, deleteTaskWithSubTasks, deleteSubTasksByTaskId, assignTask, updateSubTask, deleteSubTask, assignSubTask];

describe('US-04a Admin task / sub-task routes use project responsibility (US-04d)', () => {
  const TEST_SECRET = 'task-routes-responsibility-test-secret';
  const responsibleAdmin = { id: '3', role: 'admin' };
  const otherAdmin = { id: '7', role: 'admin' };
  const developer = { id: '2', role: 'developer' };
  let server;
  let baseUrl;
  let originalSecret;

  function send({ method, path, body }, user, overridePath) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}${overridePath ?? path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  }

  function expectNoWrite() {
    for (const write of WRITES()) {
      expect(write).not.toHaveBeenCalled();
    }
  }

  beforeAll(async () => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // A healthy, non-completed hierarchy: project 1 -> PBI 2 -> task 3 -> sub-task 4.
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    getTaskInPbi.mockResolvedValue({ id: 3, pbi_id: 2, title: 'Task', status: 'todo', assignee_id: null });
    getSubTaskById.mockResolvedValue({ id: 4, task_id: 3, title: 'Sub-task', status: 'todo', assignee_id: null });
    listProjectMembers.mockResolvedValue([{ id: '2', name: 'Developer' }]);
    updateTask.mockResolvedValue({ id: 3 });
    deleteTask.mockResolvedValue(true);
    deleteTaskWithSubTasks.mockResolvedValue(true);
    deleteSubTasksByTaskId.mockResolvedValue(undefined);
    assignTask.mockResolvedValue({ id: 3, assignee_id: '2' });
    updateSubTask.mockResolvedValue({ id: 4 });
    deleteSubTask.mockResolvedValue(true);
    assignSubTask.mockResolvedValue({ id: 4, assignee_id: '2' });
  });

  it.each(ROUTES)('lets the responsible Admin $label - the write runs', async (route) => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await send(route, responsibleAdmin);

    expect(res.status).toBe(200);
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(route.write()).toHaveBeenCalledTimes(1);
  });

  it.each(ROUTES)('refuses an Admin not responsible for the project to $label (403: responsibility lookup occurs, but no downstream resource lookup or write)', async (route) => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await send(route, otherAdmin);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getProjectResponsibility).toHaveBeenCalledTimes(1);
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '7');
    expect(getPbiById).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each(ROUTES)('refuses a Developer to $label before any responsibility lookup (403, no write)', async (route) => {
    const res = await send(route, developer);

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([ROUTES[0], ROUTES[3]])('refuses to $label on an unowned project (403, no write)', async (route) => {
    // getProjectResponsibility maps responsible_admin_id = NULL to isResponsible: false.
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await send(route, responsibleAdmin, route.path.replace('/projects/1/', '/projects/2/'));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
    expectNoWrite();
  });

  it.each([ROUTES[1], ROUTES[4]])('returns 404 to $label in a project that does not exist (no write)', async (route) => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await send(route, responsibleAdmin, route.path.replace('/projects/1/', '/projects/999/'));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'Project not found' });
    expectNoWrite();
  });

  it.each([ROUTES[2], ROUTES[5]])('returns 400 to $label with an invalid projectId, without a lookup (no write)', async (route) => {
    const res = await send(route, responsibleAdmin, route.path.replace('/projects/1/', '/projects/abc/'));

    expect(res.status).toBe(400);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('keeps nested-resource checks after the guard: a PBI outside the project is still 404', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getPbiById.mockResolvedValue(null);

    const res = await send(ROUTES[0], responsibleAdmin);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'PBI not found' });
    expectNoWrite();
  });
});
