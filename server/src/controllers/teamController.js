import {
  addTeamMember,
  getTeamById,
  listAvailableDevelopersForTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember
} from '../models/teamModel.js';
import { findUserById } from '../models/userModel.js';

// GET /api/teams
//
// Closes a gap flagged in an audit for teamModel.js already existing (fully
// implemented, fully tested) with no controller or route ever built on top
// of it. Admin-only, matching every admin
// team-management screen; there is no per-admin ownership of a team the way
// requireProjectResponsibility scopes projects, so plain requireRole('admin')
// is the whole guard.
export async function getTeamsController(req, res) {
  try {
    const teams = await listTeams();
    return res.json({ teams });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load teams' });
  }
}

// GET /api/teams/:teamId/members
// Returns both the team itself and its member list in one call, since
// TeamDetail.jsx always needs both together on load.
export async function getTeamMembersController(req, res) {
  const teamId = Number(req.params.teamId);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ message: 'A valid teamId is required' });
  }

  try {
    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const members = await listTeamMembers(teamId);
    return res.json({ team, members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load team members' });
  }
}

// GET /api/teams/:teamId/available-developers
// The candidate list for "+ Assign Developer" - every developer not already
// on this team.
export async function getAvailableDevelopersForTeamController(req, res) {
  const teamId = Number(req.params.teamId);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ message: 'A valid teamId is required' });
  }

  try {
    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const developers = await listAvailableDevelopersForTeam(teamId);
    return res.json({ developers });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load available developers' });
  }
}

// POST /api/teams/:teamId/members   body: { user_id }
// Only an existing user with role='developer' may be added - looked up and
// checked server-side regardless of what the available-developers list the
// client saw actually offered, same posture as addProjectMemberController.
export async function addTeamMemberController(req, res) {
  const teamId = Number(req.params.teamId);
  const userId = Number(req.body?.user_id);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ message: 'A valid teamId is required' });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'A valid user_id is required' });
  }

  try {
    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'developer') {
      return res.status(400).json({ message: 'Only developers can be added as team members' });
    }

    await addTeamMember(teamId, userId);
    const members = await listTeamMembers(teamId);
    return res.status(201).json({ members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add the team member' });
  }
}

// DELETE /api/teams/:teamId/members/:userId
// Idempotent (removeTeamMember), same guards as adding.
export async function removeTeamMemberController(req, res) {
  const teamId = Number(req.params.teamId);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ message: 'A valid teamId is required' });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'A valid userId is required' });
  }

  try {
    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    await removeTeamMember(teamId, userId);
    const members = await listTeamMembers(teamId);
    return res.json({ members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove the team member' });
  }
}
