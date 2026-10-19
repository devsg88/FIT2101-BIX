import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProjectController,
  listResponsibleProjectsController,
  updateProjectController,
  deleteProjectController,
  setCurrentFocusController
} from './projectController.js';
import {
  createProject,
  listProjectsForResponsibleAdmin,
  updateProjectName,
  deleteEmptyProject,
  setCurrentFocus
} from '../models/projectModel.js';

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

// US-04c: renaming a project (its board). Who may rename is decided by the
// route's requireProjectResponsibility, so these tests cover only the
// controller's own job: validating the name and saving it.
describe('updateProjectController (US-04c)', () => {
  function renameReq(body) {
    return { user: admin, params: { projectId: '1' }, body };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the trimmed name and returns the project with 200', async () => {
    const renamed = { id: '1', name: 'BIX Platform v2', responsible_admin_id: '3' };
    updateProjectName.mockResolvedValue(renamed);
    const res = mockRes();

    await updateProjectController(renameReq({ name: '  BIX Platform v2  ' }), res);

    expect(updateProjectName).toHaveBeenCalledWith(1, 'BIX Platform v2');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ project: renamed });
  });

  it.each([
    ['a missing name', {}],
    ['a null name', { name: null }],
    ['a blank name', { name: '   ' }]
  ])('returns 400 for %s, without touching the database', async (_label, body) => {
    const res = mockRes();

    await updateProjectController(renameReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A project name is required' });
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-string name, without touching the database', async () => {
    const res = mockRes();

    await updateProjectController(renameReq({ name: 42 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'The project name must be text' });
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 404 when no project was updated', async () => {
    updateProjectName.mockResolvedValue(null);
    const res = mockRes();

    await updateProjectController(renameReq({ name: 'P' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  it('returns a generic 500 when the database fails, without leaking the database error', async () => {
    updateProjectName.mockRejectedValue(new Error('relation "projects" does not exist'));
    const res = mockRes();

    await updateProjectController(renameReq({ name: 'P' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to rename the project' });
  });

  it('ignores responsible_admin_id in the body - a rename never changes the owner', async () => {
    updateProjectName.mockResolvedValue({ id: '1', name: 'P', responsible_admin_id: '3' });
    const res = mockRes();

    await updateProjectController(renameReq({ name: 'P', responsible_admin_id: '7' }), res);

    expect(updateProjectName).toHaveBeenCalledTimes(1);
    expect(updateProjectName).toHaveBeenCalledWith(1, 'P');
  });
});

// US-04c: deleting an empty project (its board). Who may delete is decided by
// the route's requireProjectResponsibility; these cover the controller's own
// mapping of the model's outcome to a response.
describe('deleteProjectController (US-04c)', () => {
  function deleteReq(projectId = '5') {
    return { user: admin, params: { projectId }, body: { projectId: '999' } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the deleted id when the project was empty', async () => {
    deleteEmptyProject.mockResolvedValue('deleted');
    const res = mockRes();

    await deleteProjectController(deleteReq('5'), res);

    expect(deleteEmptyProject).toHaveBeenCalledWith(5);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Project deleted', id: 5 });
  });

  it('returns 409 when the project still has work', async () => {
    deleteEmptyProject.mockResolvedValue('has_work');
    const res = mockRes();

    await deleteProjectController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'This board still has work (PBIs or sprints) and cannot be deleted'
    });
  });

  it('returns 404 when the project is gone', async () => {
    deleteEmptyProject.mockResolvedValue('not_found');
    const res = mockRes();

    await deleteProjectController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  it('returns a generic 500 when the model throws, without leaking the database error', async () => {
    deleteEmptyProject.mockRejectedValue(new Error('relation "projects" does not exist'));
    const res = mockRes();

    await deleteProjectController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete the project' });
  });

  it('takes the project id from the route only, never the body', async () => {
    deleteEmptyProject.mockResolvedValue('deleted');
    const res = mockRes();

    await deleteProjectController(deleteReq('5'), res);

    expect(deleteEmptyProject).toHaveBeenCalledTimes(1);
    expect(deleteEmptyProject).toHaveBeenCalledWith(5);
  });
});

// US-07 / SCRUM-198
describe('setCurrentFocusController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const developer = { id: '5', role: 'developer' };

  it('sets the focus PBI and returns 200 with the project', async () => {
    const updated = { id: '1', current_focus_pbi_id: '7' };
    setCurrentFocus.mockResolvedValue(updated);
    const req = { user: developer, params: { projectId: '1' }, body: { pbi_id: 7 } };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(setCurrentFocus).toHaveBeenCalledWith(1, 7);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ project: updated });
  });

  it('clears the focus when pbi_id is null', async () => {
    setCurrentFocus.mockResolvedValue({ id: '1', current_focus_pbi_id: null });
    const req = { user: admin, params: { projectId: '1' }, body: { pbi_id: null } };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(setCurrentFocus).toHaveBeenCalledWith(1, null);
    expect(res.json).toHaveBeenCalledWith({ project: { id: '1', current_focus_pbi_id: null } });
  });

  it.each([
    ['missing', {}],
    ['a string', { pbi_id: '7' }],
    ['zero', { pbi_id: 0 }],
    ['negative', { pbi_id: -3 }],
    ['a decimal', { pbi_id: 1.5 }],
    ['a boolean', { pbi_id: true }],
    ['an array', { pbi_id: [7] }]
  ])('returns 400 when pbi_id is %s, without touching the database', async (_label, body) => {
    const req = { user: developer, params: { projectId: '1' }, body };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('returns 400 when there is no body at all', async () => {
    const req = { user: developer, params: { projectId: '1' } };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the PBI is not in this project', async () => {
    setCurrentFocus.mockResolvedValue(null);
    const req = { user: developer, params: { projectId: '1' }, body: { pbi_id: 99 } };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found in this project' });
  });

  it('returns 500 with a plain message when the database fails', async () => {
    setCurrentFocus.mockRejectedValue(new Error('relation "projects" does not exist'));
    const req = { user: developer, params: { projectId: '1' }, body: { pbi_id: 7 } };
    const res = mockRes();

    await setCurrentFocusController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update the current focus' });
  });
});
