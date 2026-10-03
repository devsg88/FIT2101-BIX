import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  completeSubTaskController,
  completeTaskController,
  editTaskController,
  deleteTaskController,
  assignTaskController
} from './taskController.js';
import { getPbiById } from '../models/pbiModel.js';
import {
  completeSubTask,
  completeTask,
  getSubTaskById,
  getSubTasksByTaskId,
  getTaskById,
  getTaskInPbi,
  updateTask,
  deleteTask,
  assignTask
} from '../models/taskModel.js';
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

function mockReq({
  projectId = '1',
  taskId = '3',
  subTaskId,
  actual_hours = 4,
  userId = 1
} = {}) {
  return {
    params: { projectId, taskId, subTaskId },
    body: { actual_hours },
    user: { id: userId, role: 'developer' }
  };
}

const openTask = {
  id: 3,
  pbi_id: 3,
  title: 'Aggregate remaining hours per day',
  status: 'in_progress',
  assignee_id: 1,
  actual_hours: null,
  pbi_stage: 'active_sprint'
};

describe('completeTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubTasksByTaskId.mockResolvedValue([]);
  });

  it('returns 400 when actual hours are not greater than 0', async () => {
    const res = mockRes();
    await completeTaskController(mockReq({ actual_hours: 0 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('returns 400 when actual hours are missing', async () => {
    const res = mockRes();
    await completeTaskController(
      {
        params: { projectId: '1', taskId: '3' },
        body: {},
        user: { id: 1, role: 'developer' }
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task is not in that project', async () => {
    getTaskById.mockResolvedValue(null);
    const res = mockRes();
    await completeTaskController(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('returns 403 when a different developer tries to complete the task', async () => {
    getTaskById.mockResolvedValue(openTask);
    const res = mockRes();
    await completeTaskController(mockReq({ userId: 2 }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Only the assigned developer can complete this task'
    });
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('returns 400 when the task is already completed', async () => {
    getTaskById.mockResolvedValue({ ...openTask, status: 'done' });
    const res = mockRes();
    await completeTaskController(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'This task is already completed' });
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('returns 400 when the parent PBI is not in the Active Sprint', async () => {
    getTaskById.mockResolvedValue({ ...openTask, pbi_stage: 'sprint_planning' });
    const res = mockRes();
    await completeTaskController(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('completes the task and stores actual hours', async () => {
    getTaskById.mockResolvedValue(openTask);
    const updated = { ...openTask, status: 'done', actual_hours: '4.00' };
    completeTask.mockResolvedValue(updated);
    const res = mockRes();

    await completeTaskController(mockReq({ actual_hours: 4 }), res);

    expect(completeTask).toHaveBeenCalledWith(1, 3, 4);
    expect(res.json).toHaveBeenCalledWith({ task: updated });
  });
});

describe('completeSubTaskController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a sub-task done in the Active Sprint', async () => {
    getSubTaskById.mockResolvedValue({
      id: 9,
      task_id: 3,
      status: 'todo',
      pbi_stage: 'active_sprint'
    });
    completeSubTask.mockResolvedValue({ id: 9, status: 'done' });
    const res = mockRes();

    await completeSubTaskController(mockReq({ subTaskId: '9' }), res);

    expect(completeSubTask).toHaveBeenCalledWith(1, 9);
    expect(res.json).toHaveBeenCalledWith({ subTask: { id: 9, status: 'done' } });
  });
});

// --- US-04a admin task management (SCRUM-121/122) ---------------------------
// Uses the shared mockRes above; mockAdminReq is US-04a's request builder
// (named apart from US-11's mockReq, which builds a developer completion request).

function mockAdminReq({ projectId = '1', pbiId = '2', taskId = '3', body = {} } = {}) {
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

    await editTaskController(mockAdminReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is empty', async () => {
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: '  ', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A non-empty title is required' });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when the status is not a recognised value', async () => {
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'x', status: 'blocked' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'A valid status is required (todo, in_progress, done)'
    });
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(getPbiById).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(null);
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'x', status: 'todo' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found' });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('updates the task and returns it', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    const updated = { ...existingTask, title: 'Build the thing (v2)', status: 'in_progress' };
    updateTask.mockResolvedValue(updated);
    const res = mockRes();

    await editTaskController(
      mockAdminReq({ body: { title: 'Build the thing (v2)', status: 'in_progress' } }),
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

  // Completion belongs to US-11's Complete action (actual hours, completed_at,
  // its prerequisites): Edit may not mark a task done or reopen a done one,
  // but may still retitle a done one.
  it('returns 400 and writes nothing when Edit tries to mark the task done', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'Build the thing', status: 'done' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'A task can only be marked done through the Complete action'
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('returns 400 and writes nothing when Edit tries to reopen a done task', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue({ ...existingTask, status: 'done' });
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'Build the thing', status: 'in_progress' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'A completed task cannot be reopened through Edit'
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('still lets Edit retitle a done task while it stays done', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue({ ...existingTask, status: 'done' });
    const updated = { ...existingTask, title: 'Build the thing (fixed typo)', status: 'done' };
    updateTask.mockResolvedValue(updated);
    const res = mockRes();

    await editTaskController(
      mockAdminReq({ body: { title: 'Build the thing (fixed typo)', status: 'done' } }),
      res
    );

    expect(updateTask).toHaveBeenCalledWith(2, 3, { title: 'Build the thing (fixed typo)', status: 'done' });
    expect(res.json).toHaveBeenCalledWith({ task: updated });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await editTaskController(mockAdminReq({ body: { title: 'x', status: 'todo' } }), res);

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

    await deleteTaskController(mockAdminReq({ taskId: '0' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await deleteTaskController(mockAdminReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 409 when the PBI is completed, and never touches the task', async () => {
    getPbiById.mockResolvedValue(completedPbi);
    const res = mockRes();

    await deleteTaskController(mockAdminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete work items on a completed PBI'
    });
    expect(getTaskInPbi).not.toHaveBeenCalled();
    expect(deleteSubTasksByTaskId).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(null);
    const res = mockRes();

    await deleteTaskController(mockAdminReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteSubTasksByTaskId).not.toHaveBeenCalled();
  });

  it('deletes the task\'s sub-tasks before the task itself, then confirms', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    deleteTask.mockResolvedValue(true);
    const res = mockRes();
    const callOrder = [];
    deleteSubTasksByTaskId.mockImplementation(async () => { callOrder.push('subtasks'); });
    deleteTask.mockImplementation(async () => { callOrder.push('task'); return true; });

    await deleteTaskController(mockAdminReq(), res);

    expect(deleteSubTasksByTaskId).toHaveBeenCalledWith(3);
    expect(deleteTask).toHaveBeenCalledWith(2, 3);
    expect(callOrder).toEqual(['subtasks', 'task']);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 3 });
  });

  it('returns 404 if the task disappears between the check and the delete', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    deleteTask.mockResolvedValue(false);
    const res = mockRes();

    await deleteTaskController(mockAdminReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found' });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await deleteTaskController(mockAdminReq(), res);

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

    await assignTaskController(mockAdminReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id is required (use null to unassign)'
    });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when assignee_id is not a positive integer and not null', async () => {
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 'nope' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id must be a positive integer, or null to unassign'
    });
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 404 when the task does not belong to that PBI', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(null);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listProjectMembers).not.toHaveBeenCalled();
  });

  it('returns 400 when assignee_id is not a member of the project', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    listProjectMembers.mockResolvedValue([{ id: 9, name: 'Someone Else' }]);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'assignee_id must be a member of this project'
    });
    expect(assignTask).not.toHaveBeenCalled();
  });

  it('accepts a project member even though pg returns member.id as a string (bigint)', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    // This is the exact shape pg returns for a bigint column - a string, not
    // a number. Regression test for the bug found during manual smoke
    // testing (see the comment in taskController.js).
    listProjectMembers.mockResolvedValue([{ id: '1', name: 'Pang' }]);
    const assigned = { ...existingTask, assignee_id: 1 };
    assignTask.mockResolvedValue(assigned);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(assignTask).toHaveBeenCalledWith(2, 3, 1);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ task: assigned });
  });

  it('unassigns with assignee_id: null without checking project membership', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue(existingTask);
    const unassigned = { ...existingTask, assignee_id: null };
    assignTask.mockResolvedValue(unassigned);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: null } }), res);

    expect(listProjectMembers).not.toHaveBeenCalled();
    expect(assignTask).toHaveBeenCalledWith(2, 3, null);
    expect(res.json).toHaveBeenCalledWith({ task: unassigned });
  });

  it('still assigns a task that is already done - only Edit status changes into/out of done are restricted', async () => {
    getPbiById.mockResolvedValue(openPbi);
    getTaskInPbi.mockResolvedValue({ ...existingTask, status: 'done' });
    listProjectMembers.mockResolvedValue([{ id: '1', name: 'Pang' }]);
    const assigned = { ...existingTask, status: 'done', assignee_id: 1 };
    assignTask.mockResolvedValue(assigned);
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(assignTask).toHaveBeenCalledWith(2, 3, 1);
    expect(res.json).toHaveBeenCalledWith({ task: assigned });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await assignTaskController(mockAdminReq({ body: { assignee_id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to assign the task' });
  });
});

// Project-responsibility scoping (US-04a AC 5) is enforced by
// requireProjectResponsibility on the routes, so it is tested over HTTP in
// ../routes/taskRoutes.responsibility.test.js rather than here.
