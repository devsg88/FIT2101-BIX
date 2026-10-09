import { pool } from '../config/db.js';

// US-15 Sprint Burndown Chart (SCRUM-153).
// All reads are scoped to a single project. Callers pass ids that have already
// been validated by the controller.

// Every PBI in one Sprint, with the fields the burndown needs: Story Points
// (estimated_hours), whether it is Done (stage) and when (completed_at, with
// updated_at as the fallback), and its planned end date for the Sprint end.
// Completed items are included on purpose: they are part of the committed
// scope, the calculation removes them from the day they were completed.
export async function getSprintScope(projectId, sprintId) {
  const { rows } = await pool.query(
    `SELECT id, title, stage, estimated_hours, planned_end_date,
            completed_at, updated_at
       FROM product_backlog_items
      WHERE project_id = $1 AND sprint_id = $2
      ORDER BY id`,
    [projectId, sprintId]
  );
  return rows;
}
