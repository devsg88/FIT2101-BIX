import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProjectController,
  listResponsibleProjectsController
} from './projectController.js';
import { createProject, listProjectsForResponsibleAdmin } from '../models/projectModel.js';

// Replace the real database-backed model with a fake one we control per test.
vi.mock('../models/projectModel.js');

// A small fake Express response object we can inspect after calling the controller.
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const admin = { id: '3', role: 'admin' };

describe('createProjectController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the project with the requesting Admin as responsible and returns 201', async () => {
    const created = { id: '3', name: 'New Project', responsible_admin_id: '3' };
    createProject.mockResolvedValue(created);
    const req = { user: admin, body: { name: 'New Project' } };
    const res = mockRes();

    await createProjectController(req, res);

    expect(createProject).toHaveBeenCalledWith('New Project', '3');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ project: created });
  });

  it('trims surrounding whitespace from the project name before saving', async () => {
    createProject.mockResolvedValue({ id: '4', name: 'Spaced Out', responsible_admin_id: '3' });
    const req = { user: admin, body: { name: '   Spaced Out  ' } };
    const res = mockRes();

    await createProjectController(req, res);

    expect(createProject).toHaveBeenCalledWith('Spaced Out', '3');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('always takes the owner from req.user.id', async () => {
    createProject.mockResolvedValue({ id: '5', name: 'P', responsible_admin_id: '9' });
    const req = { user: { id: '9', role: 'admin' }, body: { name: 'P' } };
    const res = mockRes();

    await createProjectController(req, res);

    expect(createProject).toHaveBeenCalledWith('P', '9');
  });

  it('ignores a responsible_admin_id in the request body - it cannot override the owner', async () => {
    createProject.mockResolvedValue({ id: '6', name: 'P', responsible_admin_id: '3' });
    const req = {
      user: admin,
      body: { name: 'P', responsible_admin_id: '7', responsibleAdminId: '7' }
    };
    const res = mockRes();

    await createProjectController(req, res);

    expect(createProject).toHaveBeenCalledWith('P', '3');
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing body', undefined],
    ['an empty body', {}],
    ['a null name', { name: null }],
    ['an empty name', { name: '' }],
    ['a whitespace-only name', { name: '   \t ' }]
  ])('returns 400 for %s, without touching the database', async (_label, body) => {
    const req = { user: admin, body };
    const res = mockRes();

    await createProjectController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A project name is required' });
    expect(createProject).not.toHaveBeenCalled();
  });

  it.each([
    ['a number', 42],
    ['a boolean', true],
    ['an array', ['Project']],
    ['an object', { text: 'Project' }]
  ])('returns 400 when the name is %s, without touching the database', async (_label, name) => {
    const req = { user: admin, body: { name } };
    const res = mockRes();

    await createProjectController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'The project name must be text' });
    expect(createProject).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when the database fails, without leaking the database error', async () => {
    createProject.mockRejectedValue(
      new Error('insert or update on table "projects" violates foreign key constraint')
    );
    const req = { user: admin, body: { name: 'P' } };
    const res = mockRes();

    await createProjectController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to create the project' });
  });
});

describe('listResponsibleProjectsController (US-04c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the logged-in Admin\'s responsible projects, looked up by req.user.id', async () => {
    const projects = [
      { id: '1', name: 'BIX Platform' },
      { id: '3', name: 'US-04d Validation Project' }
    ];
    listProjectsForResponsibleAdmin.mockResolvedValue(projects);
    const req = { user: admin };
    const res = mockRes();

    await listResponsibleProjectsController(req, res);

    expect(listProjectsForResponsibleAdmin).toHaveBeenCalledWith('3');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ projects });
  });

  it('ignores any admin id in the query string or body - only the token decides', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([]);
    const req = {
      user: admin,
      query: { adminId: '7', responsible_admin_id: '7' },
      body: { adminId: '7' }
    };
    const res = mockRes();

    await listResponsibleProjectsController(req, res);

    expect(listProjectsForResponsibleAdmin).toHaveBeenCalledTimes(1);
    expect(listProjectsForResponsibleAdmin).toHaveBeenCalledWith('3');
  });

  it('returns an empty list when the Admin is responsible for no projects', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([]);
    const req = { user: { id: '9', role: 'admin' } };
    const res = mockRes();

    await listResponsibleProjectsController(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ projects: [] });
  });

  it('returns a generic 500 when the database fails, without leaking the database error', async () => {
    listProjectsForResponsibleAdmin.mockRejectedValue(new Error('relation "projects" does not exist'));
    const req = { user: admin };
    const res = mockRes();

    await listResponsibleProjectsController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load your projects' });
  });
});
