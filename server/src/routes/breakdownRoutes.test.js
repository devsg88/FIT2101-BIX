import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import * as board from '../models/boardModel.js';
import * as tasks from '../models/taskModel.js';
import { getPbiById } from '../models/pbiModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

vi.mock('../models/boardModel.js');
vi.mock('../models/taskModel.js');
vi.mock('../models/pbiModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/projectModel.js');

const routes = [
  ['GET', '/board', board.getBoard, 'board'],
  ['GET', '/pbis/10', board.getPbiBreakdown, 'pbi'],
  ['POST', '/pbis/10/tasks', tasks.createTask, 'task'],
  ['PATCH', '/tasks/11', tasks.updateTask, 'task'],
  ['POST', '/tasks/11/sub-tasks', tasks.createSubTask, 'subTask'],
  ['PATCH', '/sub-tasks/12', tasks.updateSubTask, 'subTask']
];

describe('project-scoped breakdown routes', () => {
  const secret = 'us08c-route-test-secret';
  let server;
  let baseUrl;
  let originalSecret;

  beforeAll(async () => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/projects/7`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  beforeEach(() => {
    vi.resetAllMocks();
    board.getProjectById.mockResolvedValue({ id: '7', name: 'Project' });
    board.getBoard.mockResolvedValue({ project: { id: '7' }, pbis: [], sprints: [] });
    board.getPbiBreakdown.mockResolvedValue({ id: '10', tasks: [] });
    getPbiById.mockResolvedValue({ id: '10', stage: 'sprint_planning' });
    tasks.getTaskById.mockResolvedValue({ id: '11', pbi_stage: 'sprint_planning', title: 'Task' });
    tasks.getSubTaskById.mockResolvedValue({ id: '12', pbi_stage: 'sprint_planning', title: 'Sub-task' });
    tasks.createTask.mockResolvedValue({ id: '11' });
    tasks.updateTask.mockResolvedValue({ id: '11' });
    tasks.createSubTask.mockResolvedValue({ id: '12' });
    tasks.updateSubTask.mockResolvedValue({ id: '12' });
  });

  function request(method, path, user) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${jwt.sign(user, secret, { expiresIn: '5m' })}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify({ title: 'Work' }) })
    });
  }

  describe.each(routes)('%s %s', (method, path, action) => {
    it('requires authentication', async () => {
      expect((await request(method, path)).status).toBe(401);
      expect(action).not.toHaveBeenCalled();
    });
    it('rejects a developer outside the project', async () => {
      isProjectMember.mockResolvedValue(false);
      expect((await request(method, path, { id: '2', role: 'developer' })).status).toBe(403);
      expect(action).not.toHaveBeenCalled();
    });
    it('rejects an unrelated admin even if that admin has a membership row', async () => {
      isProjectMember.mockResolvedValue(true);
      getProjectResponsibility.mockResolvedValue({ isResponsible: false });
      expect((await request(method, path, { id: '3', role: 'admin' })).status).toBe(403);
      expect(action).not.toHaveBeenCalled();
      expect(isProjectMember).not.toHaveBeenCalled();
    });
    it.each(['developer', 'admin'])('permits a project-authorized %s', async (role) => {
      isProjectMember.mockResolvedValue(true);
      getProjectResponsibility.mockResolvedValue({ isResponsible: true });
      const res = await request(method, path, { id: role === 'admin' ? '3' : '2', role });
      expect(res.status).toBe(method === 'POST' ? 201 : 200);
      expect(action).toHaveBeenCalledOnce();
    });
  });
});
