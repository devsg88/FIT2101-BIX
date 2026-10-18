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

// US-10 gap closed: previously the only INSERT INTO sprints anywhere in the
// codebase was in db/seed.sql - a project created through the real
// "Create Project" flow had zero sprints, so Start Sprint could never
// succeed on it (it only ever UPDATEs an existing sprint row, see
// startSprint below). `status` is left to its schema default ('planning')
// and `started_at` stays NULL until Start Sprint runs - a created sprint is
// not an active one.
export async function createSprint(projectId, name) {
  const { rows } = await pool.query(
    `INSERT INTO sprints (project_id, name)
     VALUES ($1, $2)
     RETURNING ${SPRINT_COLUMNS}`,
    [projectId, name]
  );
  return rows[0];
}

const PBI_COLUMNS = `
  id, project_id, sprint_id, title, description, stage,
  planned_start_date, planned_end_date, estimated_hours, actual_hours,
  created_at, updated_at
`;

// Starts a planned sprint (US-10  Yichi Zhang): marks the sprint active and
// moves every PBI currently in Sprint Planning into Active Sprint in one
// transaction. Planned dates, estimated hours, title, description, tasks and
// sub-tasks are not rewritten here (tasks live on other tables and are
// untouched). sprint_id is set so items that reached Sprint Planning via
// US-08a (stage-only move) are still attached to the sprint being started.
//
// Callers must already have rejected an empty sprint and any illegal stage
// move; this function only persists a start that has already been approved.
// If the sprint row is no longer status = 'planning', the transaction is
// rolled back and this returns null so the controller can send a 400.
export async function startSprint(projectId, sprintId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pbiResult = await client.query(
      `UPDATE product_backlog_items
          SET stage = 'active_sprint',
              sprint_id = $1
        WHERE project_id = $2 AND stage = 'sprint_planning'
        RETURNING ${PBI_COLUMNS}`,
      [sprintId, projectId]
    );

    const sprintResult = await client.query(
      `UPDATE sprints
          SET status = 'active',
              started_at = NOW()
        WHERE id = $1 AND project_id = $2 AND status = 'planning'
        RETURNING ${SPRINT_COLUMNS}`,
      [sprintId, projectId]
    );

    const sprint = sprintResult.rows[0] ?? null;
    if (!sprint) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');
    return { sprint, pbis: pbiResult.rows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
