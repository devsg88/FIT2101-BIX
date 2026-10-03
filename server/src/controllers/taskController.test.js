import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  completeSubTaskController,
  completeTaskController
} from './taskController.js';
import {
  completeSubTask,
  completeTask,
  getSubTaskById,
  getSubTasksByTaskId,
  getTaskById
} from '../models/taskModel.js';

vi.mock('../models/taskModel.js');

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
