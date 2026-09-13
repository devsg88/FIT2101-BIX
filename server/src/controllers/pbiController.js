import { getPbiById, updatePbiPlanning, updatePbiStage } from '../models/pbiModel.js';
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
// updatePlanningController (US-08b, Yichi Zhang) writes planned dates and
// Estimated Hours onto a PBI that is already in Sprint Planning. It does
// not change stage.

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
    //
    // US-10 (Yichi Zhang): sprint_planning -> active_sprint is only allowed
    // through Start Sprint, which moves every planning item together. A
    // single-card move into Active Sprint is rejected here even though the
    // shared map allows that pair of stages.
    if (targetStage === 'active_sprint') {
      return res.status(400).json({
        message: 'Cannot move a PBI into Active Sprint individually. Start the sprint instead.'
      });
    }

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

// YYYY-MM-DD only. Compared as strings, which is safe for this format
// (lexicographic order matches calendar order).
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Pulls the three US-08b fields out of the request body and turns any
// problem into a message the controller can send as a 400. Hours must be
// greater than 0 (the DB CHECK only forbids negatives; this is stricter).
function parsePlanningPayload(body) {
  const planned_start_date = body?.planned_start_date;
  const planned_end_date = body?.planned_end_date;
  const rawHours = body?.estimated_hours;

  if (typeof planned_start_date !== 'string' || !DATE_PATTERN.test(planned_start_date)) {
    return { error: 'A valid planned start date is required (YYYY-MM-DD)' };
  }

  if (typeof planned_end_date !== 'string' || !DATE_PATTERN.test(planned_end_date)) {
    return { error: 'A valid planned end date is required (YYYY-MM-DD)' };
  }

  if (planned_end_date < planned_start_date) {
    return { error: 'The planned end date cannot be earlier than the planned start date' };
  }

  const estimated_hours = Number(rawHours);
  if (!Number.isFinite(estimated_hours) || estimated_hours <= 0) {
    return { error: 'Estimated hours must be greater than 0' };
  }

  return {
    planning: {
      planned_start_date,
      planned_end_date,
      estimated_hours
    }
  };
}

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
// US-08b Yichi Zhang
// Saves planned_start_date, planned_end_date and estimated_hours on one PBI.
// Stage, sprint_id, tasks, title and actual_hours are not touched. The PBI
// must already be in Sprint Planning (US-08a); this endpoint does not move it.
export async function updatePlanningController(req, res) {
  const projectId = Number(req.params.projectId);
  const pbiId = Number(req.params.pbiId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(pbiId) || pbiId <= 0) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }

  const parsed = parsePlanningPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const pbi = await getPbiById(projectId, pbiId);
    if (!pbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    if (pbi.stage !== 'sprint_planning') {
      return res.status(400).json({
        message: 'Planning details can only be set while a PBI is in Sprint Planning'
      });
    }

    const updatedPbi = await updatePbiPlanning(projectId, pbiId, parsed.planning);
    if (!updatedPbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    return res.json({ pbi: updatedPbi });
  } catch (err) {
    // Same convention as moveStageController: never leak the raw DB error.
    return res.status(500).json({ message: 'Failed to update PBI planning details' });
  }
}
