import { pool } from '../config/db.js';
import {
  getPbisByProject,
  getPbiById,
  getTasksByProject,
  getSubTasksByProject
} from './pbiModel.js';
import { getSprintsByProject } from './sprintModel.js';
import { getTasksByPbi, getSubTasksByPbi } from './taskModel.js';

export async function getProjectById(projectId) {
  const { rows } = await pool.query(
    'SELECT id, name FROM projects WHERE id = $1',
    [projectId]
  );
  return rows[0] ?? null;
}

// Loads everything needed to render one project's board and assembles the
// nested shape (PBIs -> tasks -> sub-tasks). Returns null when the project does
// not exist. The four workflow stages themselves are not stored per board;
// they are the fixed list in ../constants/boardStages.js, applied to this
// project's PBIs by the controller when it builds the response.
export async function getBoard(projectId) {
  const [project, sprints, pbis, tasks, subTasks] = await Promise.all([
    getProjectById(projectId),
    getSprintsByProject(projectId),
    getPbisByProject(projectId),
    getTasksByProject(projectId),
    getSubTasksByProject(projectId)
  ]);

  if (!project) {
    return null;
  }

  return { project, sprints, pbis: nestPbis(pbis, tasks, subTasks) };
}

export async function getPbiBreakdown(projectId, pbiId) {
  const pbi = await getPbiById(projectId, pbiId);
  if (!pbi) return null;
  const [tasks, subTasks] = await Promise.all([
    getTasksByPbi(projectId, pbiId),
    getSubTasksByPbi(projectId, pbiId)
  ]);
  return nestPbis([pbi], tasks, subTasks)[0];
}

function nestPbis(pbis, tasks, subTasks) {
  const subTasksByTask = groupBy(subTasks, 'task_id');
  const tasksByPbi = groupBy(
    tasks.map((task) => ({
      ...task,
      subTasks: subTasksByTask[task.id] ?? []
    })),
    'pbi_id'
  );

  return pbis.map((pbi) => ({
    ...pbi,
    tasks: tasksByPbi[pbi.id] ?? []
  }));
}

function groupBy(rows, key) {
  const map = {};
  for (const row of rows) {
    const groupKey = row[key];
    if (!map[groupKey]) {
      map[groupKey] = [];
    }
    map[groupKey].push(row);
  }
  return map;
}
