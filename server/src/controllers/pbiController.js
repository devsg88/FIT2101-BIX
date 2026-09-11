import { getPbiById, updatePbiStage } from '../models/pbiModel.js';
import { checkStageTransition } from '../constants/stageTransitions.js';

// PBI mutation endpoints.
//
// moveStageController is implemented (US-08a's move-to-Sprint-Planning path,
// and the general controlled-transition mechanics from US-06). It still
// needs project-membership authorization once that exists (see
// requireProjectMembership in ../middleware/authMiddleware.js) - right now
// any authenticated user can move any project's PBIs, which is a known,
// tracked gap, not an oversight.
//
// updatePlanningController is still deferred to US-08b (planned dates +
// Estimated Hours, with its own validation: end >= start, hours > 0, etc.)
// and returns 501 rather than faking success.

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
export async function moveStageController(req, res) {
  const projectId = Number(req.params.projectId);
  const pbiId = Number(req.params.pbiId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(pbiId) || pbiId <= 0) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }

  const targetStage = req.body?.stage;
  if (!targetStage) {
    return res.status(400).json({ message: 'A target stage is required' });
  }

  try {
    // Load the PBI first so we know its CURRENT stage. The move is only
    // meaningful, and only checkable against the workflow rules, relative to
    // where the PBI actually is right now, not wherever the caller assumes.
    const pbi = await getPbiById(projectId, pbiId);
    if (!pbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    // The single shared guard from US-06 (see ../constants/stageTransitions.js):
    // only product_backlog -> sprint_planning, sprint_planning -> active_sprint,
    // and active_sprint -> completed are allowed. Anything else, including a
    // request that is already valid JSON but not a real move, is rejected here
    // with a clear reason, before the database is touched.
    const transition = checkStageTransition(pbi.stage, targetStage);
    if (!transition.allowed) {
      return res.status(400).json({ message: transition.reason });
    }

    const updatedPbi = await updatePbiStage(projectId, pbiId, targetStage);
    if (!updatedPbi) {
      // Only reachable if the PBI was removed between the check above and
      // this update. Treated the same as "not found" rather than a 500.
      return res.status(404).json({ message: 'PBI not found' });
    }

    return res.json({ pbi: updatedPbi });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message,
    // the same convention getBoardController already uses.
    return res.status(500).json({ message: 'Failed to move the PBI' });
  }
}

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
export async function updatePlanningController(req, res) {
  return res
    .status(501)
    .json({ message: 'Updating PBI planning details is not implemented yet' });
}
