import { getPbiById } from '../models/pbiModel.js';
import { getPbiBreakdown } from '../models/boardModel.js';
import {
  getTaskById, getSubTaskById,
  createTask, updateTask, createSubTask, updateSubTask
} from '../models/taskModel.js';

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseFields(body, current) {
  const title = body?.title === undefined ? current?.title : body.title;
  const description = body?.description === undefined
    ? current?.description ?? null : body.description;
  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'A non-empty title is required' };
  }
  if (description !== null && typeof description !== 'string') {
    return { error: 'Description must be text or null' };
  }
  if (current && body?.title === undefined && body?.description === undefined) {
    return { error: 'Provide a title or description to update' };
  }
  return { fields: { title: title.trim(), description: description?.trim() || null } };
}

async function saveBreakdown(req, res, { idKey, label, getParent, write, responseKey, editing }) {
  const projectId = parseId(req.params.projectId);
  const id = parseId(req.params[idKey]);
  if (!projectId || !id) {
    return res.status(400).json({ message: `A valid ${!projectId ? 'projectId' : idKey} is required` });
  }
  try {
    const parent = await getParent(projectId, id);
    if (!parent) {
      return res.status(404).json({ message: `${label} not found` });
    }
    if ((parent.pbi_stage ?? parent.stage) !== 'sprint_planning') {
      return res.status(400).json({
        message: 'Tasks and sub-tasks can only be created or edited while their PBI is in Sprint Planning'
      });
    }
    const parsed = parseFields(req.body, editing ? parent : null);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const saved = await write(projectId, id, parsed.fields);
    if (!saved) {
      return res.status(409).json({
        message: 'The parent work changed or left Sprint Planning. Refresh the board and try again.'
      });
    }
    return res.status(editing ? 200 : 201).json({ [responseKey]: saved });
  } catch (err) {
    return res.status(500).json({ message: `Failed to ${editing ? 'update' : 'create'} the ${responseKey === 'task' ? 'task' : 'sub-task'}` });
  }
}

export function createTaskController(req, res) {
  return saveBreakdown(req, res, {
    idKey: 'pbiId', label: 'PBI', getParent: getPbiById,
    write: createTask, responseKey: 'task', editing: false
  });
}

export function updateTaskController(req, res) {
  return saveBreakdown(req, res, {
    idKey: 'taskId', label: 'Task', getParent: getTaskById,
    write: updateTask, responseKey: 'task', editing: true
  });
}

export function createSubTaskController(req, res) {
  return saveBreakdown(req, res, {
    idKey: 'taskId', label: 'Task', getParent: getTaskById,
    write: createSubTask, responseKey: 'subTask', editing: false
  });
}

export function updateSubTaskController(req, res) {
  return saveBreakdown(req, res, {
    idKey: 'subTaskId', label: 'Sub-task', getParent: getSubTaskById,
    write: updateSubTask, responseKey: 'subTask', editing: true
  });
}

export async function getPbiBreakdownController(req, res) {
  const projectId = parseId(req.params.projectId);
  const pbiId = parseId(req.params.pbiId);
  if (!projectId || !pbiId) {
    return res.status(400).json({ message: `A valid ${!projectId ? 'projectId' : 'pbiId'} is required` });
  }
  try {
    const pbi = await getPbiBreakdown(projectId, pbiId);
    if (!pbi) return res.status(404).json({ message: 'PBI not found' });
    return res.json({ pbi });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load the PBI breakdown' });
  }
}
