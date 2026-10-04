import { getCompletedWorkByProject } from '../models/completedWorkModel.js';

// GET /api/projects/:projectId/completed-work
//
// US-12: access control (the admin responsible for the project, or a
// developer assigned to it - see the AC's "an admin responsible for the
// project") is enforced upstream by requireProjectAccess (see
// completedWorkRoutes.js), the same shared middleware every other
// project-scoped route now uses. This used to be a hand-written check here
// (any admin, not specifically the responsible one, bypassed membership)
// because requireProjectAccess did not exist yet when this was built; now
// that it does, duplicating that logic here would let it drift out of sync
// with the rule enforced everywhere else. This controller only has to load
// the data for a project the caller has already been cleared to see.
export async function getCompletedWorkController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const completedWork = await getCompletedWorkByProject(projectId);
    if (!completedWork) {
      // Only reachable if the project was removed between
      // requireProjectAccess's own existence check and this one - treated as
      // a 404 the same way, not a 500.
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.json(completedWork);
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message,
    // the same convention getBoardController already uses.
    return res.status(500).json({ message: 'Failed to load completed work history' });
  }
}
