import { getCompletedWorkByProject } from '../models/completedWorkModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';

// GET /api/projects/:projectId/completed-work
//
// US-12: an admin can view any project's completed-work history; a developer
// can view it only for a project they have an explicit project_members row
// for (the same membership US-05 checks). This follows the role-branch
// pattern dashboardController.js already uses (role === 'admin' bypasses
// membership, everyone else is checked against project_members) rather than
// the still-stubbed requireProjectMembership middleware (see
// ../middleware/authMiddleware.js), which nothing in this codebase calls yet.
//
// The membership check runs before the project is even loaded, and an
// unauthorized caller always gets 403, never 404: a developer who is not
// assigned to a project should not be able to learn whether that projectId
// exists from this endpoint's response.
export async function getCompletedWorkController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  const { role, id: userId } = req.user;

  try {
    if (role !== 'admin') {
      const isMember = await isProjectMember(projectId, userId);
      if (!isMember) {
        return res.status(403).json({
          message: "You do not have permission to view this project's completed work"
        });
      }
    }

    const completedWork = await getCompletedWorkByProject(projectId);
    if (!completedWork) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.json(completedWork);
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message,
    // the same convention getBoardController already uses.
    return res.status(500).json({ message: 'Failed to load completed work history' });
  }
}
