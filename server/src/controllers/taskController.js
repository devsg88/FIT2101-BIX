import { getPbiById } from '../models/pbiModel.js';
import {
  completeSubTask,
  completeTask,
  getSubTaskById,
  getSubTasksByTaskId,
  getTaskById,
  getTaskInPbi,
  updateTaskInPbi,
  deleteTaskWithSubTasks,
  assignTask
} from '../models/taskModel.js';
import {
  isTaskStatus,
  TASK_STATUSES,
  editStatusTransitionError
} from '../constants/taskStatus.js';
import { listProjectMembers } from '../models/projectMembershipModel.js';

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


// Task mutation endpoints for US-04a.
//
// editTaskController / deleteTaskController (SCRUM-121) and
// assignTaskController (SCRUM-122) are requireAuth + requireRole('admin')
// only for now (see taskRoutes.js) - project-scoping by "admin responsible
// for this project" is blocked on US-04d and intentionally NOT built here
// (see the implementation prompt's "Known gaps" #1). What IS enforced here
// is plain referential integrity: the PBI must exist in the given project,
// and the task must belong to that PBI, or the request 404s - a taskId that
// happens to belong to a different PBI/project can never be reached
// through these endpoints. Once US-04d lands, a requireProjectResponsibility
// guard gets added to the route chain in taskRoutes.js; nothing here changes.
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

    const task = await getTaskInPbi(pbiId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Completing (or reopening) a task belongs to US-11's Complete action -
    // see editStatusTransitionError in ../constants/taskStatus.js.
    const transitionError = editStatusTransitionError(task.status, parsed.task.status, 'task');
    if (transitionError) {
      return res.status(400).json({ message: transitionError });
    }

    const updatedTask = await updateTaskInPbi(pbiId, taskId, parsed.task);
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

    const task = await getTaskInPbi(pbiId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Known gap #4: every parent->child foreign key is ON DELETE RESTRICT
    // (see server/db/schema.sql), so the task's sub-tasks must be removed
    // first, bottom-up. NFR-03: deleteTaskWithSubTasks does both in one
    // transaction, so a failure part-way can never leave the task without
    // its sub-tasks.
    const deleted = await deleteTaskWithSubTasks(pbiId, taskId);
    if (!deleted) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ message: 'Task deleted', id: taskId });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete the task' });
  }
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/assignee
// SCRUM-122. Body: { assignee_id: <userId> | null }. null unassigns.
// A non-null assignee_id must be one of this project's members
// (listProjectMembers, from US-05's projectMembershipModel.js) - assigning
// work to someone who is not even a member of the project would be a
// dead-end assignment, so it is rejected with 400 rather than silently
// allowed.
export async function assignTaskController(req, res) {
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

  // assignee_id is required in the body, but its value may legitimately be
  // null (unassign), so "missing key" and "explicit null" are told apart
  // instead of both falling through the same falsy check.
  if (!('assignee_id' in (req.body ?? {}))) {
    return res.status(400).json({ message: 'assignee_id is required (use null to unassign)' });
  }

  const rawAssigneeId = req.body.assignee_id;
  const isUnassigning = rawAssigneeId === null;
  const assigneeId = isUnassigning ? null : parsePositiveInt(rawAssigneeId);

  if (!isUnassigning && !assigneeId) {
    return res.status(400).json({ message: 'assignee_id must be a positive integer, or null to unassign' });
  }

  try {
    const { error } = await loadPbiOr404(projectId, pbiId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const task = await getTaskInPbi(pbiId, taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (assigneeId !== null) {
      const members = await listProjectMembers(projectId);
      // pg returns bigint columns (users.id here) as strings, not numbers,
      // to avoid silent precision loss above Number.MAX_SAFE_INTEGER - see
      // https://github.com/brianc/node-pg-types. assigneeId is a JS number
      // (from parsePositiveInt), so member.id must be coerced before the
      // comparison, or every real assignment would wrongly 400 here.
      const isMember = members.some((member) => Number(member.id) === assigneeId);
      if (!isMember) {
        return res.status(400).json({ message: 'assignee_id must be a member of this project' });
      }
    }

    const updatedTask = await assignTask(pbiId, taskId, assigneeId);
    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ task: updatedTask });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to assign the task' });
  }
}
