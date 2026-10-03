import { pool } from '../config/db.js';

const TASK_COLUMNS = `
  t.id, t.pbi_id, t.title, t.description, t.status,
  t.assignee_id, t.actual_hours, t.completed_at
`;

// US-11 — Yichi Zhang (SCRUM-127 / 128 / 129)
export async function getTaskById(projectId, taskId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS},
            p.id AS pbi_id,
            p.project_id,
            p.stage AS pbi_stage
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE t.id = $1 AND p.project_id = $2`,
    [taskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getTasksByPbi(projectId, pbiId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS}
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1 AND t.pbi_id = $2
      ORDER BY t.id`,
    [projectId, pbiId]
  );
  return rows;
}

export async function getSubTasksByTaskId(taskId) {
  const { rows } = await pool.query(
    `SELECT id, task_id, title, description, status
       FROM sub_tasks
      WHERE task_id = $1
      ORDER BY id`,
    [taskId]
  );
  return rows;
}

export async function completeTask(projectId, taskId, actualHours) {
  const { rows } = await pool.query(
    `UPDATE tasks t
        SET status = 'done',
            actual_hours = $1,
            completed_at = NOW()
       FROM product_backlog_items p
      WHERE t.id = $2
        AND t.pbi_id = p.id
        AND p.project_id = $3
      RETURNING ${TASK_COLUMNS}`,
    [actualHours, taskId, projectId]
  );
  return rows[0] ?? null;
}

export async function completeSubTask(projectId, subTaskId) {
  const { rows } = await pool.query(
    `UPDATE sub_tasks s
        SET status = 'done'
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1
        AND s.task_id = t.id
        AND p.project_id = $2
      RETURNING s.id, s.task_id, s.title, s.description, s.status`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTaskById(projectId, subTaskId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.description, s.status,
            p.project_id, p.stage AS pbi_stage
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1 AND p.project_id = $2`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTasksByPbi(projectId, pbiId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.description, s.status
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1 AND p.id = $2
      ORDER BY s.id`,
    [projectId, pbiId]
  );
  return rows;
}

// Lock the parent PBI and check its stage inside each write. This serializes
// breakdown changes with Start Sprint, which updates that same PBI row.
export async function createTask(projectId, pbiId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT id, stage FROM product_backlog_items
        WHERE project_id = $1 AND id = $2 FOR UPDATE
     )
     INSERT INTO tasks (pbi_id, title, description, status)
     SELECT id, $3, $4, 'todo' FROM parent WHERE stage = 'sprint_planning'
     RETURNING id, pbi_id, title, description, status,
               assignee_id, actual_hours, completed_at`,
    [projectId, pbiId, title, description]
  );
  return rows[0] ?? null;
}

export async function updateTask(projectId, taskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT p.id, p.stage FROM product_backlog_items p
       JOIN tasks t ON t.pbi_id = p.id
        WHERE p.project_id = $1 AND t.id = $2 FOR UPDATE OF p
     )
     UPDATE tasks t SET title = $3, description = $4
       FROM parent
      WHERE t.id = $2 AND t.pbi_id = parent.id
        AND parent.stage = 'sprint_planning'
      RETURNING ${TASK_COLUMNS}`,
    [projectId, taskId, title, description]
  );
  return rows[0] ?? null;
}

export async function createSubTask(projectId, taskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT t.id, p.stage FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
        WHERE p.project_id = $1 AND t.id = $2 FOR UPDATE OF p
     )
     INSERT INTO sub_tasks (task_id, title, description, status)
     SELECT id, $3, $4, 'todo' FROM parent WHERE stage = 'sprint_planning'
     RETURNING id, task_id, title, description, status`,
    [projectId, taskId, title, description]
  );
  return rows[0] ?? null;
}

export async function updateSubTask(projectId, subTaskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT t.id, p.stage FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
       JOIN sub_tasks s ON s.task_id = t.id
        WHERE p.project_id = $1 AND s.id = $2 FOR UPDATE OF p
     )
     UPDATE sub_tasks s SET title = $3, description = $4
       FROM parent
      WHERE s.id = $2 AND s.task_id = parent.id
        AND parent.stage = 'sprint_planning'
      RETURNING s.id, s.task_id, s.title, s.description, s.status`,
    [projectId, subTaskId, title, description]
  );
  return rows[0] ?? null;
}
