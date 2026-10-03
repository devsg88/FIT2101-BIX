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

// Creates a PBI in a project (US-04b). Callers pass a title that has already
// been validated and trimmed, and a description that is either trimmed text
// or null. Only those columns are written: stage and sprint_id are left to
// their schema defaults, so a new PBI always starts in the Product Backlog
// with no sprint, and planning fields / hours start empty.
export async function createPbi(projectId, { title, description }) {
  const { rows } = await pool.query(
    `INSERT INTO product_backlog_items (project_id, title, description)
     VALUES ($1, $2, $3)
     RETURNING ${PBI_COLUMNS}`,
    [projectId, title, description]
  );
  return rows[0];
}

// The PBI detail columns an Admin may edit (US-04b). Stage, sprint, planning
// dates and hours are deliberately not here - they have their own endpoints
// and workflow rules (US-06 / US-08a / US-08b / US-10).
const EDITABLE_PBI_COLUMNS = Object.freeze(['title', 'description']);

// Updates a PBI's details (US-04b). `changes` holds only the fields to change,
// already validated by the caller; anything not in EDITABLE_PBI_COLUMNS is
// ignored, so column names in the SQL never come from request data. Same
// scoping as updatePbiStage: one UPDATE matched by id AND project, returning
// null when no row matches (wrong project or no such PBI).
export async function updatePbiDetails(projectId, pbiId, changes) {
  const columns = EDITABLE_PBI_COLUMNS.filter((column) =>
    Object.prototype.hasOwnProperty.call(changes, column)
  );

  if (columns.length === 0) {
    throw new Error('updatePbiDetails called with no editable fields');
  }

  const setClause = columns
    .map((column, index) => `${column} = $${index + 1}`)
    .join(', ');
  const values = columns.map((column) => changes[column]);

  const { rows } = await pool.query(
    `UPDATE product_backlog_items
        SET ${setClause}
      WHERE id = $${columns.length + 1} AND project_id = $${columns.length + 2}
      RETURNING ${PBI_COLUMNS}`,
    [...values, pbiId, projectId]
  );
  return rows[0] ?? null;
}

// Deletes a PBI (US-04b), scoped to its id AND project like every other
// write here. The stage condition is repeated in the DELETE itself, so a PBI
// that moved into Active Sprint after the controller's check is still never
// deleted - this returns null instead, for the caller to report.
//
// A PBI that still has tasks cannot be deleted: tasks.pbi_id is ON DELETE
// RESTRICT (see server/db/schema.sql), so PostgreSQL rejects the DELETE with
// a foreign_key_violation (code 23503), which is passed through to the caller.
export async function deletePbi(projectId, pbiId) {
  const { rows } = await pool.query(
    `DELETE FROM product_backlog_items
      WHERE id = $1 AND project_id = $2 AND stage <> 'active_sprint'
      RETURNING ${PBI_COLUMNS}`,
    [pbiId, projectId]
  );
  return rows[0] ?? null;
}

// Moves a PBI to a new stage (US-08a). This is a single UPDATE on the
// existing row, scoped to both its id AND its project, so:
//   - the PBI is never deleted/recreated, its id and every column other than
//     `stage` are left exactly as they were (updated_at is bumped by the
//     database trigger, that is the only other change);
//   - a pbiId that belongs to a different project cannot be touched, the
//     WHERE clause simply matches no row;
//   - if no row matches (wrong project, or the PBI does not exist at all),
//     this returns null rather than throwing, so the caller can turn that
//     into a 404.
//
// This function does not decide WHETHER the move is allowed, that is
// checkStageTransition's job (see ../constants/stageTransitions.js). Callers
// must run that check first and only reach this function once a move has
// already been approved. Keeping the two separate keeps persistence (this
// file) and business rules (that file) from tangling together.
export async function updatePbiStage(projectId, pbiId, newStage) {
  const { rows } = await pool.query(
    `UPDATE product_backlog_items
        SET stage = $1
      WHERE id = $2 AND project_id = $3
      RETURNING ${PBI_COLUMNS}`,
    [newStage, pbiId, projectId]
  );
  return rows[0] ?? null;
}

// Writes Sprint Planning fields (US-08b — Yichi Zhang). Same scoping as
// updatePbiStage: one UPDATE on the existing row, matched by id AND project,
// so the PBI is never deleted/recreated and a pbiId from another project
// cannot be touched. Only the three planning columns are set; stage,
// sprint_id, tasks, title, description, actual_hours and created_at are left
// alone (updated_at is bumped by the database trigger).
export async function updatePbiPlanning(
  projectId,
  pbiId,
  { planned_start_date, planned_end_date, estimated_hours }
) {
  const { rows } = await pool.query(
    `UPDATE product_backlog_items
        SET planned_start_date = $1,
            planned_end_date = $2,
            estimated_hours = $3
      WHERE id = $4 AND project_id = $5
      RETURNING ${PBI_COLUMNS}`,
    [planned_start_date, planned_end_date, estimated_hours, pbiId, projectId]
  );
  return rows[0] ?? null;
}

// Used by Start Sprint (US-10 — Yichi Zhang) to load every PBI currently
// sitting in one stage for a project, without assembling the whole board.
export async function getPbisByStage(projectId, stage) {
  const { rows } = await pool.query(
    `SELECT ${PBI_COLUMNS}
       FROM product_backlog_items
      WHERE project_id = $1 AND stage = $2
      ORDER BY id`,
    [projectId, stage]
  );
  return rows;
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
