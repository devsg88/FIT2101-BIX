import { pool } from '../config/db.js';
import {
  getPbisByProject,
  getTasksByProject,
  getSubTasksByProject
} from './pbiModel.js';
import { getSprintsByProject } from './sprintModel.js';

export async function getProjectById(projectId) {
  const { rows } = await pool.query(
    'SELECT id, name FROM projects WHERE id = $1',
    [projectId]
  );
  return rows[0] ?? null;
}

// Loads everything needed to render one project's board and assembles the
// nested shape (PBIs -> tasks -> sub-tasks). Returns null when the project does
// not exist. The four workflow stages themselves are a fixed constant owned by
// the controller / frontend, not stored per board.
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

  const subTasksByTask = groupBy(subTasks, 'task_id');
  const tasksByPbi = groupBy(
    tasks.map((task) => ({
      ...task,
      subTasks: subTasksByTask[task.id] ?? []
    })),
    'pbi_id'
  );

  return {
    project,
    sprints,
    pbis: pbis.map((pbi) => ({
      ...pbi,
      tasks: tasksByPbi[pbi.id] ?? []
    }))
  };
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
