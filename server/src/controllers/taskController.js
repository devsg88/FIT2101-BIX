import { getPbiById } from '../models/pbiModel.js';
import { getTaskById, updateTask, deleteTask } from '../models/taskModel.js';
import { deleteSubTasksByTaskId } from '../models/subTaskModel.js';
import { isTaskStatus, TASK_STATUSES } from '../constants/taskStatus.js';

// Task mutation endpoints for US-04a.
//
// editTaskController / deleteTaskController (SCRUM-121) are requireAuth +
// requireRole('admin') only for now (see taskRoutes.js) - project-scoping
// by "admin responsible for this project" is blocked on US-04d and
// intentionally NOT built here (see the implementation prompt's "Known
// gaps" #1). What IS enforced here is plain referential integrity: the PBI
// must exist in the given project, and the task must belong to that PBI,
// or the request 404s - a taskId that happens to belong to a different
// PBI/project can never be reached through these endpoints. Once US-04d
// lands, a requireProjectResponsibility guard gets added to the route chain
// in taskRoutes.js; nothing here changes.
//
// assignTaskController (SCRUM-122) is added to this same file in a later
// commit - it is still "the tasks resource", just a different action.
//
// createTask/createSubTask are deliberately NOT added here - US-08c owns
// task/sub-task creation. server/db/seed.sql already has enough tasks and
// sub-tasks (ids 1-5 and 1-3) to exercise edit/delete/assign manually, so no
// scaffolding create endpoint was needed for that; see the SCRUM-126
// walkthrough.

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Loads the PBI a task route is nested under, and turns "does not exist"
// into the 404 the controller should send back as-is.
async function loadPbiOr404(projectId, pbiId) {
  const pbi = await getPbiById(projectId, pbiId);
  if (!pbi) {
    return { error: { status: 404, message: 'PBI not found' } };
  }
  return { pbi };
}

function parseTaskPayload(body) {
  const title = body?.title;
  const status = body?.status;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: 'A non-empty title is required' };
  }
  if (!isTaskStatus(status)) {
    return { error: `A valid status is required (${TASK_STATUSES.join(', ')})` };
  }

  return { task: { title: title.trim(), status } };
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
export async function editTaskController(req, res) {
  const projectId = parsePositiveInt(req.params.projectId);
  const pbiId = parsePositiveInt(req.params.pbiId);
  const taskId = parsePositiveInt(req.params.taskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!pbiId) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }
  if (!taskId) {
    return res.status(400).json({ message: 'A valid taskId is required' });
  }

  const parsed = parseTaskPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const { error } = await loadPbiOr404(projectId, pbiId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const task = await getTaskById(pbiId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const updatedTask = await updateTask(pbiId, taskId, parsed.task);
    if (!updatedTask) {
      // Only reachable if the task was removed between the check above and
      // this update - same convention as pbiController.moveStageController.
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ task: updatedTask });
  } catch (err) {
    // Never leak the raw database error to the client.
    return res.status(500).json({ message: 'Failed to update the task' });
  }
}

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
export async function deleteTaskController(req, res) {
  const projectId = parsePositiveInt(req.params.projectId);
  const pbiId = parsePositiveInt(req.params.pbiId);
  const taskId = parsePositiveInt(req.params.taskId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!pbiId) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }
  if (!taskId) {
    return res.status(400).json({ message: 'A valid taskId is required' });
  }

  try {
    const { pbi, error } = await loadPbiOr404(projectId, pbiId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    // Known gap #5 (resolved for this pass): work items on a Completed PBI
    // cannot be deleted. Checked before the task is even loaded, so this
    // never depends on the task's own state.
    if (pbi.stage === 'completed') {
      return res.status(409).json({ message: 'Cannot delete work items on a completed PBI' });
    }

    const task = await getTaskById(pbiId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Known gap #4: every parent->child foreign key is ON DELETE RESTRICT
    // (see server/db/schema.sql), so the task's sub-tasks must be removed
    // first, bottom-up, or the task's own DELETE fails against the
    // database constraint. deleteSubTasksByTaskId is unconditional - a task
    // with no sub-tasks is a harmless no-op DELETE.
    await deleteSubTasksByTaskId(taskId);
    const deleted = await deleteTask(pbiId, taskId);
    if (!deleted) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ message: 'Task deleted', id: taskId });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete the task' });
  }
}
