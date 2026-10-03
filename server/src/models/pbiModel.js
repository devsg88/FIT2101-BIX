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
    `SELECT t.id, t.pbi_id, t.title, t.description, t.status,
            t.assignee_id, t.actual_hours, t.completed_at
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
    `SELECT s.id, s.task_id, s.title, s.description, s.status
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1
      ORDER BY s.id`,
    [projectId]
  );
  return rows;
}
