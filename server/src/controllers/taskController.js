import {
  completeSubTask,
  completeTask,
  getSubTaskById,
  getSubTasksByTaskId,
  getTaskById
} from '../models/taskModel.js';

function parsePositiveId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePositiveHours(raw) {
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { error: 'Actual hours must be greater than 0' };
  }
  return { hours };
}

function sameUserId(left, right) {
  return String(left) === String(right);
}

function isDone(status) {
  return status === 'done';
}

// POST /api/projects/:projectId/tasks/:taskId/complete
// US-11 — Yichi Zhang (SCRUM-128, SCRUM-129)
// Assigned developer only. Effort must be a positive number. On success the
// task status becomes 'done' (completed) and actual_hours is stored on the
// task row, never on estimated_hours of the parent PBI.
export async function completeTaskController(req, res) {
  const projectId = parsePositiveId(req.params.projectId);
  const taskId = parsePositiveId(req.params.taskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!taskId) {
    return res.status(400).json({ message: 'A valid taskId is required' });
  }

  const parsedHours = parsePositiveHours(req.body?.actual_hours);
  if (parsedHours.error) {
    return res.status(400).json({ message: parsedHours.error });
  }

  const userId = req.user?.id;
  if (userId == null) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const task = await getTaskById(projectId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (task.pbi_stage !== 'active_sprint') {
      return res.status(400).json({
        message: 'A task can only be completed while its PBI is in the Active Sprint'
      });
    }

    if (isDone(task.status)) {
      return res.status(400).json({ message: 'This task is already completed' });
    }

    if (task.assignee_id == null) {
      return res.status(400).json({ message: 'This task has no assigned developer' });
    }

    if (!sameUserId(task.assignee_id, userId)) {
      return res.status(403).json({
        message: 'Only the assigned developer can complete this task'
      });
    }

    const subTasks = await getSubTasksByTaskId(taskId);
    if (subTasks.some((subTask) => !isDone(subTask.status))) {
      return res.status(400).json({
        message: 'All sub-tasks must be completed before this task can be completed'
      });
    }

    const updated = await completeTask(projectId, taskId, parsedHours.hours);
    if (!updated) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ task: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to complete the task' });
  }
}

// POST /api/projects/:projectId/sub-tasks/:subTaskId/complete
export async function completeSubTaskController(req, res) {
  const projectId = parsePositiveId(req.params.projectId);
  const subTaskId = parsePositiveId(req.params.subTaskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!subTaskId) {
    return res.status(400).json({ message: 'A valid subTaskId is required' });
  }

  try {
    const subTask = await getSubTaskById(projectId, subTaskId);
    if (!subTask) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    if (subTask.pbi_stage !== 'active_sprint') {
      return res.status(400).json({
        message: 'A sub-task can only be completed while its PBI is in the Active Sprint'
      });
    }

    if (isDone(subTask.status)) {
      return res.status(400).json({ message: 'This sub-task is already completed' });
    }

    const updated = await completeSubTask(projectId, subTaskId);
    if (!updated) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    return res.json({ subTask: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to complete the sub-task' });
  }
}
