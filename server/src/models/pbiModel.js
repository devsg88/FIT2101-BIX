import { pool } from '../config/db.js';

// All reads are scoped to a single project. Callers pass a projectId that has
// already been validated by the controller.

const PBI_COLUMNS = `
  id, project_id, sprint_id, title, description, stage,
  planned_start_date, planned_end_date, estimated_hours, actual_hours,
  created_at, updated_at
`;

export async function getPbisByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT ${PBI_COLUMNS}
       FROM product_backlog_items
      WHERE project_id = $1
      ORDER BY id`,
    [projectId]
  );
  return rows;
}

export async function getPbiById(projectId, pbiId) {
  const { rows } = await pool.query(
    `SELECT ${PBI_COLUMNS}
       FROM product_backlog_items
      WHERE project_id = $1 AND id = $2`,
    [projectId, pbiId]
  );
  return rows[0] ?? null;
}

// Tasks and sub-tasks are read per project (joined up through their parent PBI)
// so the board can be assembled in one pass without an N+1 query per PBI.

export async function getTasksByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.pbi_id, t.title, t.status
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1
      ORDER BY t.id`,
    [projectId]
  );
  return rows;
}

export async function getSubTasksByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.status
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1
      ORDER BY s.id`,
    [projectId]
  );
  return rows;
}
