import { getPbiById } from '../models/pbiModel.js';
import { getTaskById } from '../models/taskModel.js';
import { getSubTaskById, updateSubTask, deleteSubTask } from '../models/subTaskModel.js';
import { isTaskStatus, TASK_STATUSES } from '../constants/taskStatus.js';

// Sub-task mutation endpoints for US-04a. Mirrors taskController.js one
// level down: every check here goes PBI -> task -> sub-task, so a
// subTaskId that belongs to a different task (or that task's PBI belongs
// to a different project) can never be reached through these endpoints.
// Same admin-only, no-project-responsibility-scoping-yet situation as
// taskController.js - see the comment there for why.

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Loads the PBI and task a sub-task route is nested under, in order, so the
// first missing link in the chain is what gets reported.
async function loadPbiAndTaskOr404(projectId, pbiId, taskId) {
  const pbi = await getPbiById(projectId, pbiId);
  if (!pbi) {
    return { error: { status: 404, message: 'PBI not found' } };
  }

  const task = await getTaskById(pbiId, taskId);
  if (!task) {
    return { error: { status: 404, message: 'Task not found' } };
  }

  return { pbi, task };
}

function parseSubTaskPayload(body) {
  const title = body?.title;
  const status = body?.status;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: 'A non-empty title is required' };
  }
  if (!isTaskStatus(status)) {
    return { error: `A valid status is required (${TASK_STATUSES.join(', ')})` };
  }

  return { subTask: { title: title.trim(), status } };
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
export async function editSubTaskController(req, res) {
  const projectId = parsePositiveInt(req.params.projectId);
  const pbiId = parsePositiveInt(req.params.pbiId);
  const taskId = parsePositiveInt(req.params.taskId);
  const subTaskId = parsePositiveInt(req.params.subTaskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!pbiId) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }
  if (!taskId) {
    return res.status(400).json({ message: 'A valid taskId is required' });
  }
  if (!subTaskId) {
    return res.status(400).json({ message: 'A valid subTaskId is required' });
  }

  const parsed = parseSubTaskPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const { error } = await loadPbiAndTaskOr404(projectId, pbiId, taskId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const subTask = await getSubTaskById(taskId, subTaskId);
    if (!subTask) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    const updatedSubTask = await updateSubTask(taskId, subTaskId, parsed.subTask);
    if (!updatedSubTask) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    return res.json({ subTask: updatedSubTask });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update the sub-task' });
  }
}

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
export async function deleteSubTaskController(req, res) {
  const projectId = parsePositiveInt(req.params.projectId);
  const pbiId = parsePositiveInt(req.params.pbiId);
  const taskId = parsePositiveInt(req.params.taskId);
  const subTaskId = parsePositiveInt(req.params.subTaskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!pbiId) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }
  if (!taskId) {
    return res.status(400).json({ message: 'A valid taskId is required' });
  }
  if (!subTaskId) {
    return res.status(400).json({ message: 'A valid subTaskId is required' });
  }

  try {
    const { pbi, error } = await loadPbiAndTaskOr404(projectId, pbiId, taskId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    // Known gap #5 (resolved for this pass): work items on a Completed PBI
    // cannot be deleted - a sub-task is still a work item on that PBI even
    // though it hangs off a task rather than the PBI directly.
    if (pbi.stage === 'completed') {
      return res.status(409).json({ message: 'Cannot delete work items on a completed PBI' });
    }

    const subTask = await getSubTaskById(taskId, subTaskId);
    if (!subTask) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    // Sub-tasks are the bottom of the hierarchy - nothing references a
    // sub-task as a parent, so this DELETE needs no child clean-up first.
    const deleted = await deleteSubTask(taskId, subTaskId);
    if (!deleted) {
      return res.status(404).json({ message: 'Sub-task not found' });
    }

    return res.json({ message: 'Sub-task deleted', id: subTaskId });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete the sub-task' });
  }
}
