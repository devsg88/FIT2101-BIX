import { pool } from '../config/db.js';

// Project membership (developer <-> project). Kept separate from team
// membership (see teamModel.js) on purpose: which projects a developer can
// access is tracked directly here, not inferred from their team - see
// server/db/schema.sql, "Users, teams and membership".
//
// isProjectMember() is the piece US-05 access control needs: a developer
// may view/act on a project's board only if a row exists here for them.
// This module does not decide *who* is allowed to call it (e.g. whether
// admins bypass the check) - that policy belongs in the route/middleware
// layer that calls it, not here.

export async function listProjectMembers(projectId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY u.name`,
    [projectId]
  );
  return rows;
}

// Developers not already assigned to this project - the candidate list for
// an admin's "add member" action.
export async function listAvailableDevelopersForProject(projectId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM users u
      WHERE u.role = 'developer'
        AND NOT EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = $1 AND pm.user_id = u.id
        )
      ORDER BY u.name`,
    [projectId]
  );
  return rows;
}

// Idempotent: assigning a user who is already a member is a no-op, not an error.
export async function addProjectMember(projectId, userId) {
  await pool.query(
    `INSERT INTO project_members (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [projectId, userId]
  );
}

// Idempotent: removing a user who isn't a member is a no-op, not an error.
export async function removeProjectMember(projectId, userId) {
  await pool.query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
}

export async function isProjectMember(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return rows.length > 0;
}

// The projects a given user is a member of - the reverse of
// listProjectMembers (which goes project -> its members). Used by the
// developer dashboard's "My Projects" count (US-02).
export async function listProjectsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
      WHERE pm.user_id = $1
      ORDER BY p.name`,
    [userId]
  );
  return rows;
}
