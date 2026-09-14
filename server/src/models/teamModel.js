import { pool } from '../config/db.js';

// Teams and team membership (developer <-> team). Project membership is a
// separate concern - see projectMembershipModel.js - a developer's team and
// the projects they can access are tracked independently, not derived from
// one another (see server/db/schema.sql, "Users, teams and membership").

export async function listTeams() {
  const { rows } = await pool.query(
    `SELECT id, name, created_at FROM teams ORDER BY name`
  );
  return rows;
}

export async function getTeamById(teamId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at FROM teams WHERE id = $1`,
    [teamId]
  );
  return rows[0] ?? null;
}

// Everyone currently on a team.
export async function listTeamMembers(teamId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY u.name`,
    [teamId]
  );
  return rows;
}

// Developers not already on this team - the candidate list for an admin's
// "add member" action.
export async function listAvailableDevelopersForTeam(teamId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM users u
      WHERE u.role = 'developer'
        AND NOT EXISTS (
          SELECT 1 FROM team_members tm
           WHERE tm.team_id = $1 AND tm.user_id = u.id
        )
      ORDER BY u.name`,
    [teamId]
  );
  return rows;
}

// Idempotent: adding a user who is already on the team is a no-op, not an error.
export async function addTeamMember(teamId, userId) {
  await pool.query(
    `INSERT INTO team_members (team_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, userId]
  );
}

// Idempotent: removing a user who isn't on the team is a no-op, not an error.
export async function removeTeamMember(teamId, userId) {
  await pool.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
}
