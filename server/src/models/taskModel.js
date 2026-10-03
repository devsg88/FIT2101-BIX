import { pool } from '../config/db.js';

const TASK_COLUMNS = `
  t.id, t.pbi_id, t.title, t.status,
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
    `SELECT id, task_id, title, status
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
      RETURNING s.id, s.task_id, s.title, s.status`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTaskById(projectId, subTaskId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.status,
            p.project_id, p.stage AS pbi_stage
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1 AND p.project_id = $2`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}
