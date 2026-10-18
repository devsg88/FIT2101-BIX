import { getProjectById } from '../models/boardModel.js';
import {
  addProjectMember,
  listAvailableDevelopersForProject,
  listProjectMembers,
  removeProjectMember
} from '../models/projectMembershipModel.js';
import { findUserById } from '../models/userModel.js';

// GET /api/projects/:projectId/members
//
// Added as part of US-04a/SCRUM-122, not because US-04a owns project
// membership (it does not - US-05 does, via projectMembershipModel.js,
// which already has listProjectMembers fully implemented) but because
// SCRUM-122's assignee validation and SCRUM-124's assignee dropdown both
// need a way to read a project's member list, and no HTTP endpoint for it
// existed anywhere in the codebase yet (TeamDetail.jsx / US-03/US-05's
// admin team UI is still client-side mock data only, see
// client/src/data/orgMockData.js). This is a thin, read-only wrapper
// around the existing model function - no new business logic.
//
// Any authenticated user may read a project's member list (same posture as
// getBoardController: read access is not yet scoped by project membership,
// tracked separately via requireProjectMembership in authMiddleware.js).
export async function getProjectMembersController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const members = await listProjectMembers(projectId);
    return res.json({ members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load project members' });
  }
}

// GET /api/projects/:projectId/available-developers
//
// US-03/US-05 (SCRUM-?): the candidate list for the "add member" action
// below - every developer not already on this project. Same guards as the
// mutation routes (admin, responsible for this project): a Developer has no
// reason to see who *isn't* on the project, only who is (getProjectMembersController).
export async function getAvailableDevelopersController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const developers = await listAvailableDevelopersForProject(projectId);
    return res.json({ developers });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load available developers' });
  }
}

// POST /api/projects/:projectId/members   body: { user_id }
//
// Closes the gap flagged in the NFR-01 frontend audit: project membership
// (the thing US-05 actually gates Developer access on, see
// projectMembershipModel.js) previously had no route to write it at all -
// TeamDetail.jsx's "Assign Developer" only ever updated local React state
// against client/src/data/orgMockData.js, never the database. Admin-only and
// responsible-Admin-only, same as every other project mutation (see
// projectMembershipRoutes.js). Only an existing user with role='developer'
// may be added - the target id is never trusted blindly, it is looked up
// and its role checked server-side regardless of what the available-
// developers list the client saw actually offered.
export async function addProjectMemberController(req, res) {
  const projectId = Number(req.params.projectId);
  const userId = Number(req.body?.user_id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'A valid user_id is required' });
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'developer') {
      return res.status(400).json({ message: 'Only developers can be added as project members' });
    }

    await addProjectMember(projectId, userId);
    const members = await listProjectMembers(projectId);
    return res.status(201).json({ members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add the project member' });
  }
}

// DELETE /api/projects/:projectId/members/:userId
//
// Idempotent (removeProjectMember), same guards as adding. Removing a
// developer takes effect immediately on their next request - every access
// check reads project_members fresh, nothing caches membership (see
// requireProjectMembership in authMiddleware.js).
export async function removeProjectMemberController(req, res) {
  const projectId = Number(req.params.projectId);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'A valid userId is required' });
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    await removeProjectMember(projectId, userId);
    const members = await listProjectMembers(projectId);
    return res.json({ members });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove the project member' });
  }
}
