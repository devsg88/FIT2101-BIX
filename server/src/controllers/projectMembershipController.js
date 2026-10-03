import { getProjectById } from '../models/boardModel.js';
import { listProjectMembers } from '../models/projectMembershipModel.js';

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
