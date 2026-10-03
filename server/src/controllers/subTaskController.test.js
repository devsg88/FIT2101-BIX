import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  editSubTaskController,
  deleteSubTaskController,
  assignSubTaskController
} from './subTaskController.js';
import { getPbiById } from '../models/pbiModel.js';
import { getTaskInPbi } from '../models/taskModel.js';
import {
  getSubTaskById,
  updateSubTask,
  deleteSubTask,
  assignSubTask
} from '../models/subTaskModel.js';
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

function mockReq({ projectId = '1', pbiId = '2', taskId = '3', subTaskId = '4', body = {} } = {}) {
  return { params: { projectId, pbiId, taskId, subTaskId }, body };
}

const openPbi = { id: 2, project_id: 1, stage: 'active_sprint' };
const completedPbi = { id: 2, project_id: 1, stage: 'completed' };
const parentTask = { id: 3, pbi_id: 2, title: 'Parent task', status: 'in_progress', assignee_id: null };
const existingSubTask = { id: 4, task_id: 3, title: 'Validate input', status: 'todo', assignee_id: null };

describe('editSubTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for an invalid subTaskId before touching the database', async () => {
    const res = mockRes();

    await editSubTaskController(mockReq({ subTaskId: 'abc', body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status', async () => {
    const res = mockRes();

    await editSubTaskController(mockReq({ body: { title: 'x', status: 'blocked' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the PBI does not exist, and never loads the task', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await editSubTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(getTaskInPbi).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(null);
    const res = mockRes();

    await editSubTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found' });
    expect(getSubTaskById).not.toHaveBeenCalled();
  });

  it('returns 404 when the sub-task does not belong to that task', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(null);
    const res = mockRes();

    await editSubTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Sub-task not found' });
    expect(updateSubTask).not.toHaveBeenCalled();
  });

  it('updates the sub-task and returns it', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    const updated = { ...existingSubTask, title: 'Validate input (v2)', status: 'done' };
    updateSubTask.mockResolvedValue(updated);
    const res = mockRes();

    await editSubTaskController(
      mockReq({ body: { title: 'Validate input (v2)', status: 'done' } }),
      res
    );

    expect(updateSubTask).toHaveBeenCalledWith(3, 4, { title: 'Validate input (v2)', status: 'done' });
    expect(res.json).toHaveBeenCalledWith({ subTask: updated });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await editSubTaskController(mockReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update the sub-task' });
  });
});

describe('deleteSubTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 when the parent PBI is completed, and never loads the sub-task', async () => {
    getPbiById.mockResolvedValue(completedPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    const res = mockRes();

    await deleteSubTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete work items on a completed PBI'
    });
    expect(getSubTaskById).not.toHaveBeenCalled();
    expect(deleteSubTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the sub-task does not belong to that task', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(null);
    const res = mockRes();

    await deleteSubTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteSubTask).not.toHaveBeenCalled();
  });

  it('deletes the sub-task with no child clean-up (sub-tasks are the bottom of the hierarchy)', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    deleteSubTask.mockResolvedValue(true);
    const res = mockRes();

    await deleteSubTaskController(mockReq(), res);

    expect(deleteSubTask).toHaveBeenCalledWith(3, 4);
    expect(res.json).toHaveBeenCalledWith({ message: 'Sub-task deleted', id: 4 });
  });

  it('returns 404 if the sub-task disappears between the check and the delete', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    deleteSubTask.mockResolvedValue(false);
    const res = mockRes();

    await deleteSubTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Sub-task not found' });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await deleteSubTaskController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete the sub-task' });
  });
});

describe('assignSubTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when assignee_id is missing from the body entirely', async () => {
    const res = mockRes();

    await assignSubTaskController(mockReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when assignee_id is not a member of the project', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    listProjectMembers.mockResolvedValue([{ id: 9, name: 'Someone Else' }]);
    const res = mockRes();

    await assignSubTaskController(mockReq({ body: { assignee_id: 2 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id must be a member of this project'
    });
    expect(assignSubTask).not.toHaveBeenCalled();
  });

  it('accepts a project member even though pg returns member.id as a string (bigint)', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    listProjectMembers.mockResolvedValue([{ id: '2', name: 'Developer' }]);
    const assigned = { ...existingSubTask, assignee_id: 2 };
    assignSubTask.mockResolvedValue(assigned);
    const res = mockRes();

    await assignSubTaskController(mockReq({ body: { assignee_id: 2 } }), res);

    expect(assignSubTask).toHaveBeenCalledWith(3, 4, 2);
    expect(res.json).toHaveBeenCalledWith({ subTask: assigned });
  });

  it('unassigns with assignee_id: null without checking project membership', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(parentTask);
    getSubTaskById.mockResolvedValue(existingSubTask);
    const unassigned = { ...existingSubTask, assignee_id: null };
    assignSubTask.mockResolvedValue(unassigned);
    const res = mockRes();

    await assignSubTaskController(mockReq({ body: { assignee_id: null } }), res);

    expect(listProjectMembers).not.toHaveBeenCalled();
    expect(assignSubTask).toHaveBeenCalledWith(3, 4, null);
    expect(res.json).toHaveBeenCalledWith({ subTask: unassigned });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await assignSubTaskController(mockReq({ body: { assignee_id: 2 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to assign the sub-task' });
  });
});

// See the identical, more detailed comment in taskController.test.js - this
// mirrors it for sub-tasks. Skipped on purpose: no data model yet to set up
// "admin not responsible for this project" against. See US-04d.
describe('project-responsibility scoping', () => {
  it.skip('blocks an admin from managing sub-tasks in a project they are not responsible for (US-04d)', async () => {
    // Left unimplemented on purpose - see US-04d.
  });
});
