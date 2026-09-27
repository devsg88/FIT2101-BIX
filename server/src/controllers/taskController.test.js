import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  editTaskController,
  deleteTaskController,
  assignTaskController
} from './taskController.js';
import { getPbiById } from '../models/pbiModel.js';
import { getTaskById, updateTask, deleteTask, assignTask } from '../models/taskModel.js';
import { deleteSubTasksByTaskId } from '../models/subTaskModel.js';
import { listProjectMembers } from '../models/projectMembershipModel.js';

vi.mock('../models/pbiModel.js');
vi.mock('../models/taskModel.js');
vi.mock('../models/subTaskModel.js');
vi.mock('../models/projectMembershipModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', pbiId = '2', taskId = '3', body = {} } = {}) {
  return { params: { projectId, pbiId, taskId }, body };
}

const openPbi = { id: 2, project_id: 1, stage: 'sprint_planning' };
const completedPbi = { id: 2, project_id: 1, stage: 'completed' };
const existingTask = { id: 3, pbi_id: 2, title: 'Build the thing', status: 'todo', assignee_id: null };

describe('editTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await editTaskController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is empty', async () => {
    const res = mockRes();

    await editTaskController(mockReq({ body: { title: '  ', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A non-empty title is required' });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when the status is not a recognised value', async () => {
    const res = mockRes();

    await editTaskController(mockReq({ body: { title: 'x', status: 'blocked' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'A valid status is required (todo, in_progress, done)'
    });
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await editTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(getPbiById).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(null);
    const res = mockRes();

    await editTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found' });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('updates the task and returns it', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    const updated = { ...existingTask, title: 'Build the thing (v2)', status: 'in_progress' };
    updateTask.mockResolvedValue(updated);
    const res = mockRes();

    await editTaskController(
      mockReq({ body: { title: 'Build the thing (v2)', status: 'in_progress' } }),
      res
    );

    expect(updateTask).toHaveBeenCalledWith(2, 3, {
      title: 'Build the thing (v2)',
      status: 'in_progress'
    });
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ task: updated });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await editTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update the task' });
  });
});

describe('deleteTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when taskId is not a positive integer', async () => {
    const res = mockRes();

    await deleteTaskController(mockReq({ taskId: '0' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await deleteTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 409 when the PBI is completed, and never touches the task', async () => {
    getPbiById.mockResolvedValue(completedPbi);
    const res = mockRes();

    await deleteTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete work items on a completed PBI'
    });
    expect(getTaskById).not.toHaveBeenCalled();
    expect(deleteSubTasksByTaskId).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(null);
    const res = mockRes();

    await deleteTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteSubTasksByTaskId).not.toHaveBeenCalled();
  });

  it('deletes the task\'s sub-tasks before the task itself, then confirms', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    deleteTask.mockResolvedValue(true);
    const res = mockRes();
    const callOrder = [];
    deleteSubTasksByTaskId.mockImplementation(async () => { callOrder.push('subtasks'); });
    deleteTask.mockImplementation(async () => { callOrder.push('task'); return true; });

    await deleteTaskController(mockReq(), res);

    expect(deleteSubTasksByTaskId).toHaveBeenCalledWith(3);
    expect(deleteTask).toHaveBeenCalledWith(2, 3);
    expect(callOrder).toEqual(['subtasks', 'task']);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 3 });
  });

  it('returns 404 if the task disappears between the check and the delete', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    deleteTask.mockResolvedValue(false);
    const res = mockRes();

    await deleteTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found' });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await deleteTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete the task' });
  });
});

describe('assignTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when assignee_id is missing from the body entirely', async () => {
    const res = mockRes();

    await assignTaskController(mockReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id is required (use null to unassign)'
    });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when assignee_id is not a positive integer and not null', async () => {
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 'nope' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id must be a positive integer, or null to unassign'
    });
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(null);
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listProjectMembers).not.toHaveBeenCalled();
  });

  it('returns 400 when assignee_id is not a member of the project', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    listProjectMembers.mockResolvedValue([{ id: 9, name: 'Someone Else' }]);
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id must be a member of this project'
    });
    expect(assignTask).not.toHaveBeenCalled();
  });

  it('accepts a project member even though pg returns member.id as a string (bigint)', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    // This is the exact shape pg returns for a bigint column - a string, not
    // a number. Regression test for the bug found during manual smoke
    // testing (see the comment in taskController.js).
    listProjectMembers.mockResolvedValue([{ id: '1', name: 'Pang' }]);
    const assigned = { ...existingTask, assignee_id: 1 };
    assignTask.mockResolvedValue(assigned);
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 1 } }), res);

    expect(assignTask).toHaveBeenCalledWith(2, 3, 1);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ task: assigned });
  });

  it('unassigns with assignee_id: null without checking project membership', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskById.mockResolvedValue(existingTask);
    const unassigned = { ...existingTask, assignee_id: null };
    assignTask.mockResolvedValue(unassigned);
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: null } }), res);

    expect(listProjectMembers).not.toHaveBeenCalled();
    expect(assignTask).toHaveBeenCalledWith(2, 3, null);
    expect(res.json).toHaveBeenCalledWith({ task: unassigned });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await assignTaskController(mockReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to assign the task' });
  });
});

// --- Project-responsibility scoping (blocked on US-04d) ---------------------
//
// US-04a's acceptance criteria include "an admin cannot manage Tasks or
// Sub-tasks in projects they are not responsible for" (AC 5), but that
// concept - which admin is responsible for which project - does not exist
// anywhere in this codebase yet. It is owned by US-04d, a separate,
// not-yet-shipped story (see the implementation prompt's "Known gaps" #1
// and the TODO in taskRoutes.js). This test is intentionally skipped rather
// than deleted or faked, so it stays visible as exactly what SCRUM-121/122
// still owe once US-04d lands: un-skip it here once
// requireProjectResponsibility (or equivalent) exists and is wired into
// taskRoutes.js/subTaskRoutes.js after requireRole('admin').
describe('project-responsibility scoping', () => {
  it.skip('blocks an admin from managing tasks in a project they are not responsible for (US-04d)', async () => {
    // Left unimplemented on purpose - there is no data model yet (e.g. a
    // projects.responsible_admin_id column or equivalent) to set up this
    // scenario against. See US-04d.
  });
});
