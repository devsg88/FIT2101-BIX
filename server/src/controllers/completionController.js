import { getPbiById, getTasksByProject } from '../models/pbiModel.js';
import { completePbi } from '../models/completionModel.js';
import { checkStageTransition } from '../constants/stageTransitions.js';

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

function isDone(status) {
  return status === 'done';
}

function uniquePositiveIds(values) {
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = parsePositiveId(value);
    if (!id) {
      continue;
    }
    const key = String(id);
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  }
  return ids;
}

// POST /api/projects/:projectId/pbis/:pbiId/complete
// US-11 — Yichi Zhang
// Records Actual Hours (never Estimated Hours) and collaborators, then
// moves the PBI from Active Sprint to Completed. A parent PBI with tasks
// can only be completed once every task is done; PBI actual hours are the
// sum of per-task actual_hours (SCRUM-127 granularity).
export async function completePbiController(req, res) {
  const projectId = parsePositiveId(req.params.projectId);
  const pbiId = parsePositiveId(req.params.pbiId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!pbiId) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }

  const userId = parsePositiveId(req.user?.id);
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const pbi = await getPbiById(projectId, pbiId);
    if (!pbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    const transition = checkStageTransition(pbi.stage, 'completed');
    if (!transition.allowed) {
      return res.status(400).json({ message: transition.reason });
    }

    const tasks = (await getTasksByProject(projectId)).filter(
      (task) => String(task.pbi_id) === String(pbiId)
    );

    if (tasks.some((task) => !isDone(task.status))) {
      return res.status(400).json({
        message: 'All tasks must be completed before this PBI can be marked Completed'
      });
    }

    let actualHours;
    if (tasks.length > 0) {
      actualHours = tasks.reduce((sum, task) => sum + Number(task.actual_hours || 0), 0);
      if (!(actualHours > 0)) {
        return res.status(400).json({
          message: 'Completed tasks must include actual hours before the PBI can be completed'
        });
      }
    } else {
      const parsed = parsePositiveHours(req.body?.actual_hours);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      actualHours = parsed.hours;
    }

    const fromBody = Array.isArray(req.body?.collaborator_ids)
      ? req.body.collaborator_ids
      : [];
    const fromTasks = tasks
      .map((task) => task.assignee_id)
      .filter((id) => id != null);
    const collaboratorIds = uniquePositiveIds([userId, ...fromTasks, ...fromBody]);

    if (collaboratorIds.length === 0) {
      return res.status(400).json({
        message: 'At least one collaborator is required to complete this PBI'
      });
    }

    const completed = await completePbi(projectId, pbiId, actualHours, collaboratorIds);
    if (!completed) {
      return res.status(400).json({
        message: 'This PBI is no longer in the Active Sprint'
      });
    }

    return res.json(completed);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to complete the PBI' });
  }
}
