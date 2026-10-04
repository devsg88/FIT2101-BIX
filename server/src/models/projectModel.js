import { pool } from '../config/db.js';

// Projects and Admin responsibility for them (US-04d).
//
// A project's responsible Admin is stored on the project row itself
// (projects.responsible_admin_id, see server/db/schema.sql), not in
// project_members - that table is Developer access (US-05), a different
// concept. Reading a single project by id already exists as getProjectById
// in boardModel.js and is not duplicated here.
//
// This module does not decide *who* may create a project or when the
// responsibility check applies - that policy belongs in the route/middleware
// layer that calls it, the same split projectMembershipModel.js uses.

const PROJECT_COLUMNS = `id, name, responsible_admin_id`;

// Creates a project with the given Admin recorded as responsible for it.
// Callers pass a name that has already been validated and trimmed.
//
// One INSERT, so the project and its responsible Admin are written together
// or not at all - a failed insert can never leave a project without its
// owner. Nothing else is inserted: the project board is not stored as rows
// (its four stages are the fixed list in ../constants/boardStages.js), so a
// new project with zero PBIs already has its empty four-stage board.
export async function createProject(name, responsibleAdminId) {
  const { rows } = await pool.query(
    `INSERT INTO projects (name, responsible_admin_id)
     VALUES ($1, $2)
     RETURNING ${PROJECT_COLUMNS}`,
    [name, responsibleAdminId]
  );
  return rows[0];
}

// The reusable "is this Admin responsible for this project?" lookup.
//   null                     - the project does not exist
//   { isResponsible: true }  - adminId is the project's responsible Admin
//   { isResponsible: false } - someone else is, or nobody is (NULL)
//
// One query tells "no such project" apart from "not responsible", so a caller
// can answer 404 vs 403 without a second round trip. The comparison is done
// in SQL rather than in JS because pg returns bigint ids as strings while ids
// from elsewhere (e.g. route params) may be numbers; COALESCE turns the NULL
// that "NULL = $2" produces for an unowned project into false.
export async function getProjectResponsibility(projectId, adminId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(responsible_admin_id = $2, false) AS is_responsible
       FROM projects
      WHERE id = $1`,
    [projectId, adminId]
  );

  if (rows.length === 0) {
    return null;
  }
  return { isResponsible: rows[0].is_responsible };
}

// The projects a given Admin is responsible for (US-04c) - the list an Admin
// navigates to their boards from. Matches on responsible_admin_id only, never
// project_members, and returns just what navigation needs (id, name). ids are
// left as pg returns them (bigint as string), the same as every other model.
// An unowned project (NULL) never matches, so it appears in no Admin's list.
export async function listProjectsForResponsibleAdmin(adminId) {
  const { rows } = await pool.query(
    `SELECT id, name
       FROM projects
      WHERE responsible_admin_id = $1
      ORDER BY id`,
    [adminId]
  );
  return rows;
}

// Renames a project - its board's name (US-04c). Callers pass a name that has
// already been validated and trimmed, for a project whose responsible Admin
// has already been checked (requireProjectResponsibility). Only the name is
// written; responsible_admin_id is never changed here. Returns the updated
// row, or null if no project matched (e.g. it was removed in the meantime).
export async function updateProjectName(projectId, name) {
  const { rows } = await pool.query(
    `UPDATE projects
        SET name = $1
      WHERE id = $2
      RETURNING ${PROJECT_COLUMNS}`,
    [name, projectId]
  );
  return rows[0] ?? null;
}

// PostgreSQL "foreign_key_violation".
const FOREIGN_KEY_VIOLATION = '23503';

// Deletes a project - its board - only while it has no work in it (US-04c).
// "Work" is any PBI or sprint: tasks, sub-tasks and PBI collaborators can only
// exist under a PBI, so checking those two is enough. Nothing is cascaded
// away; project_members rows go with the project through their own
// ON DELETE CASCADE (they are access links, not work).
//
// One transaction: the project row is locked FOR UPDATE first, so a PBI or
// sprint being added at the same moment (which needs a lock on that same row)
// waits until this finishes. The RESTRICT foreign keys from sprints and PBIs
// are the final backstop - if one still fires, it is reported as 'has_work'.
//
// Returns 'deleted', 'has_work' or 'not_found'. Any other error is rethrown.
export async function deleteEmptyProject(projectId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const project = await client.query(
      'SELECT id FROM projects WHERE id = $1 FOR UPDATE',
      [projectId]
    );
    if (project.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const work = await client.query(
      `SELECT EXISTS (SELECT 1 FROM product_backlog_items WHERE project_id = $1)
           OR EXISTS (SELECT 1 FROM sprints WHERE project_id = $1) AS has_work`,
      [projectId]
    );
    if (work.rows[0].has_work) {
      await client.query('ROLLBACK');
      return 'has_work';
    }

    await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await client.query('COMMIT');
    return 'deleted';
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === FOREIGN_KEY_VIOLATION) {
      return 'has_work';
    }
    throw err;
  } finally {
    client.release();
  }
}
