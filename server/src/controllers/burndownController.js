import { getBurndownData } from '../models/burndownModel.js';
import { buildBurndown } from '../utils/burndown.js';

// US-15 Sprint Burndown Chart (SCRUM-153).
//
// Who may call these is decided at the route (../routes/burndownRoutes.js):
// requireAuth, then requireProjectAccess - a Developer must be a member of
// the project, an Admin its responsible Admin. The controller only validates
// ids and shapes the response.

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// GET /api/projects/:projectId/sprints/:sprintId/burndown
// Responds with the burndown data contract (see ../utils/burndown.js).
export async function getBurndownController(req, res) {
  const projectId = parseId(req.params.projectId);
  const sprintId = parseId(req.params.sprintId);

  if (!projectId) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  if (!sprintId) {
    return res.status(400).json({ message: 'A valid sprintId is required' });
  }

  try {
    const data = await getBurndownData(projectId, sprintId);
    if (!data) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    return res.json(buildBurndown(data.sprint, data.pbis));
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to load the burndown chart' });
  }
}
