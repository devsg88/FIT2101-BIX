import { pool } from '../config/db.js';

// All reads are scoped to a single project.

const SPRINT_COLUMNS = `id, project_id, name, status, started_at, created_at`;

export async function getSprintsByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT ${SPRINT_COLUMNS}
       FROM sprints
      WHERE project_id = $1
      ORDER BY id`,
    [projectId]
  );
  return rows;
}

export async function getSprintById(projectId, sprintId) {
  const { rows } = await pool.query(
    `SELECT ${SPRINT_COLUMNS}
       FROM sprints
      WHERE project_id = $1 AND id = $2`,
    [projectId, sprintId]
  );
  return rows[0] ?? null;
}
