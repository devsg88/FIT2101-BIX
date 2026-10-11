import { pool } from '../config/db.js';

// All reads are scoped to a single project.

// scrum_master_id and product_owner_identifier are the US-09 Scrum roles, so
// every sprint the board and sprint list return already carries them.
const SPRINT_COLUMNS = `id, project_id, name, status, started_at, created_at,
  scrum_master_id, product_owner_identifier`;

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

// Updates a sprint's Scrum Master and/or Product Owner (US-09 / SCRUM-176).
//
// changes may hold either or both of:
//   scrumMasterId           a user id, or null to clear the tag
//   productOwnerIdentifier  text (email or name), or null to clear it
// A field left out of changes keeps its current value: each CASE only writes
// the new value when its "was sent" flag is true. Callers validate the values
// first - in particular, that the Scrum Master is a real user.
//
// Scoped to the project, so a sprint id from another project matches no row.
// Returns the updated sprint, or null when no sprint matched.
export async function updateSprintRoles(projectId, sprintId, changes) {
  const hasScrumMaster = changes.scrumMasterId !== undefined;
  const hasProductOwner = changes.productOwnerIdentifier !== undefined;

  const { rows } = await pool.query(
    `UPDATE sprints
        SET scrum_master_id = CASE WHEN $3::boolean THEN $4::bigint
                                   ELSE scrum_master_id END,
            product_owner_identifier = CASE WHEN $5::boolean THEN $6::varchar
                                            ELSE product_owner_identifier END
      WHERE project_id = $1 AND id = $2
      RETURNING ${SPRINT_COLUMNS}`,
    [
      projectId,
      sprintId,
      hasScrumMaster,
      hasScrumMaster ? changes.scrumMasterId : null,
      hasProductOwner,
      hasProductOwner ? changes.productOwnerIdentifier : null
    ]
  );
  return rows[0] ?? null;
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
