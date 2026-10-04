import { pool } from '../config/db.js';

const PBI_COLUMNS = `
  id, project_id, sprint_id, title, description, stage,
  planned_start_date, planned_end_date, estimated_hours, actual_hours,
  created_at, updated_at
`;

// US-11 — Yichi Zhang
// Completes a PBI: writes Actual Hours (never Estimated Hours), records
// collaborators, and moves stage to completed in one transaction.
export async function completePbi(projectId, pbiId, actualHours, collaboratorIds) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pbiResult = await client.query(
      `UPDATE product_backlog_items
          SET stage = 'completed',
              actual_hours = $1
        WHERE id = $2 AND project_id = $3 AND stage = 'active_sprint'
        RETURNING ${PBI_COLUMNS}`,
      [actualHours, pbiId, projectId]
    );

    const pbi = pbiResult.rows[0] ?? null;
    if (!pbi) {
      await client.query('ROLLBACK');
      return null;
    }

    if (collaboratorIds.length > 0) {
      const values = collaboratorIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');
      await client.query(
        `INSERT INTO pbi_collaborators (pbi_id, user_id)
         VALUES ${values}
         ON CONFLICT (pbi_id, user_id) DO NOTHING`,
        [pbiId, ...collaboratorIds]
      );
    }

    const collaborators = await client.query(
      `SELECT u.id, u.name, u.email, u.role
         FROM pbi_collaborators pc
         JOIN users u ON u.id = pc.user_id
        WHERE pc.pbi_id = $1
        ORDER BY u.name`,
      [pbiId]
    );

    await client.query('COMMIT');
    return { pbi, collaborators: collaborators.rows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCollaboratorsForPbi(pbiId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
       FROM pbi_collaborators pc
       JOIN users u ON u.id = pc.user_id
      WHERE pc.pbi_id = $1
      ORDER BY u.name`,
    [pbiId]
  );
  return rows;
}

// US-12: Completed Work History reads every completed PBI's collaborators in
// one pass (same convention as pbiModel.js's getTasksByProject /
// getSubTasksByProject: one query per project, not one query per PBI), so
// the history list never fires an extra round trip per row. Each returned
// row carries pbi_id alongside the collaborator's fields so the caller can
// group rows by pbi_id itself - same shape getTasksByProject already uses.
export async function getCollaboratorsByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT pc.pbi_id, u.id, u.name, u.email, u.role
       FROM pbi_collaborators pc
       JOIN users u ON u.id = pc.user_id
       JOIN product_backlog_items p ON p.id = pc.pbi_id
      WHERE p.project_id = $1
      ORDER BY pc.pbi_id, u.name`,
    [projectId]
  );
  return rows;
}
