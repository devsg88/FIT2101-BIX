// PBI mutation endpoints.
//
// These are wired into the routing layer so the frontend contract is stable,
// but the workflow logic is deferred to later stories and each handler returns
// 501 rather than faking success.
//
// Deferred:
//   - moveStageController      -> US-08a (move PBI into Sprint Planning) and the
//                                 wider controlled-transition rules of US-06.
//   - updatePlanningController -> US-08b (planned dates + Estimated Hours, with
//                                 validation: end >= start, hours > 0, etc.).
//
// Both also need project-membership authorization (see requireProjectMembership
// in ../middleware/authMiddleware.js) before they may change data.
//
// moveStageController specifically must validate the requested move with
// checkStageTransition (../constants/stageTransitions.js) before touching the
// database, and reject anything it does not allow with a 400.

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
export async function moveStageController(req, res) {
  return res
    .status(501)
    .json({ message: 'Moving a PBI between stages is not implemented yet' });
}

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
export async function updatePlanningController(req, res) {
  return res
    .status(501)
    .json({ message: 'Updating PBI planning details is not implemented yet' });
}
