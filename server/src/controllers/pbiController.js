import {
  createPbi,
  deletePbi,
  getCurrentFocusPbiId,
  getPbiById,
  getPbisByProject,
  updatePbiDetails,
  updatePbiPlanning,
  updatePbiStage
} from '../models/pbiModel.js';
import { checkStageTransition } from '../constants/stageTransitions.js';

// PBI mutation endpoints.
//
// moveStageController is implemented (US-08a's move-to-Sprint-Planning path,
// and the general controlled-transition mechanics from US-06). It is
// guarded by requireProjectAccess at the route (../routes/pbiRoutes.js):
// a Developer must be a member of the project, an Admin its responsible
// Admin.
//
// updatePlanningController (US-08b, Yichi Zhang) writes planned dates and
// Estimated Hours onto a PBI that is already in Sprint Planning. It does
// not change stage.
//
// listPbisController (US-04b) lists a project's PBIs for the Admin
// responsible for that project.

// GET /api/projects/:projectId/pbis
// US-04b. The route (see ../routes/pbiRoutes.js) is requireAuth +
// requireRole('admin') + requireProjectResponsibility, so by the time this
// runs the caller is the Admin responsible for an existing project. The
// projectId is still validated here so the controller is safe on its own.
// Returns the PBIs only, flat - their Tasks and Sub-tasks are US-04a - plus
// the project's current_focus_pbi_id (US-07) so the page can mark that row.
export async function listPbisController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const [pbis, currentFocusPbiId] = await Promise.all([
      getPbisByProject(projectId),
      getCurrentFocusPbiId(projectId)
    ]);
    return res.json({ pbis, current_focus_pbi_id: currentFocusPbiId ?? null });
  } catch (err) {
    // Same convention as the other controllers: never leak the raw DB error.
    return res.status(500).json({ message: 'Failed to load the Product Backlog Items' });
  }
}

// Pulls title and description out of a create request body and turns any
// problem into a message the controller can send as a 400. Only these two
// fields are read; anything else (stage, sprint_id, hours, project_id, ...)
// is ignored, so a new PBI cannot be created part-way through the workflow
// or into a different project from the one in the route.
function parsePbiPayload(body) {
  const rawTitle = body?.title;
  const rawDescription = body?.description;

  if (rawTitle === undefined || rawTitle === null) {
    return { error: 'A PBI title is required' };
  }

  if (typeof rawTitle !== 'string') {
    return { error: 'The PBI title must be text' };
  }

  const title = rawTitle.trim();
  if (title === '') {
    return { error: 'A PBI title is required' };
  }

  // Description is optional. Missing, null or blank is stored as NULL.
  let description = null;
  if (rawDescription !== undefined && rawDescription !== null) {
    if (typeof rawDescription !== 'string') {
      return { error: 'The PBI description must be text' };
    }
    description = rawDescription.trim() || null;
  }

  return { pbi: { title, description } };
}

// POST /api/projects/:projectId/pbis
// US-04b. Same guards as listPbisController: only the Admin responsible for
// this (existing) project gets here. The project always comes from the
// route's :projectId, never from the body.
export async function createPbiController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  const parsed = parsePbiPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const pbi = await createPbi(projectId, parsed.pbi);
    return res.status(201).json({ pbi });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create the PBI' });
  }
}

// Pulls the editable fields out of an edit request body (US-04b). Partial:
// only the fields actually present are changed, but at least one is needed.
// Title, if sent, follows the same rules as on create. Description, if sent,
// may be text or null; blank or null clears it. Anything else in the body
// (stage, sprint_id, hours, project_id, ...) is ignored.
function parsePbiChanges(body) {
  const changes = {};

  if (body?.title !== undefined) {
    if (typeof body.title !== 'string') {
      return { error: 'The PBI title must be text' };
    }
    const title = body.title.trim();
    if (title === '') {
      return { error: 'The PBI title cannot be blank' };
    }
    changes.title = title;
  }

  if (body?.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return { error: 'The PBI description must be text' };
    }
    changes.description = body.description?.trim() || null;
  }

  if (Object.keys(changes).length === 0) {
    return { error: 'Provide a title or description to update' };
  }

  return { changes };
}

// PATCH /api/projects/:projectId/pbis/:pbiId
// US-04b. Same guards as create: only the Admin responsible for this project
// gets here. Edits details in any stage; it never changes stage, sprint,
// planning dates or hours.
export async function updatePbiDetailsController(req, res) {
  const projectId = Number(req.params.projectId);
  const pbiId = Number(req.params.pbiId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(pbiId) || pbiId <= 0) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }

  const parsed = parsePbiChanges(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    // Scoped to this project, so a PBI id from another project is a 404 and
    // cannot be edited through a project this Admin is responsible for.
    const updatedPbi = await updatePbiDetails(projectId, pbiId, parsed.changes);
    if (!updatedPbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    return res.json({ pbi: updatedPbi });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update the PBI' });
  }
}

// PostgreSQL error codes for deleting a PBI that other rows still reference.
// tasks.pbi_id and pbi_collaborators.pbi_id (US-11) are ON DELETE RESTRICT,
// which PostgreSQL reports as restrict_violation (23001); foreign_key_violation
// (23503) is what the default NO ACTION reports, kept so a future schema
// change still maps here.
const PBI_STILL_REFERENCED = new Set(['23001', '23503']);

// The 409 message names what is blocking the delete. pbi_collaborators rows
// exist only for a PBI completed through US-11, and are completed-work history
// (US-12/US-13), so that case says so instead of mentioning tasks.
function stillReferencedMessage(err) {
  if (String(err?.constraint ?? '').startsWith('pbi_collaborators')) {
    return 'Cannot delete a completed PBI: its collaborators are part of the completed-work history.';
  }
  return 'Cannot delete a PBI that still has tasks. Remove its tasks first.';
}

// DELETE /api/projects/:projectId/pbis/:pbiId
// US-04b. Same guards as create/edit: only the Admin responsible for this
// project gets here. Business safety rules:
//   - a PBI in Active Sprint is being worked on and cannot be deleted (400);
//   - a PBI that still has tasks cannot be deleted (409) - its Tasks and
//     Sub-tasks are managed under US-04a and are never removed from here.
// Responds 200 with the deleted PBI (not 204), because the client's request
// helper always parses a JSON body.
export async function deletePbiController(req, res) {
  const projectId = Number(req.params.projectId);
  const pbiId = Number(req.params.pbiId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(pbiId) || pbiId <= 0) {
    return res.status(400).json({ message: 'A valid pbiId is required' });
  }

  try {
    const pbi = await getPbiById(projectId, pbiId);
    if (!pbi) {
      return res.status(404).json({ message: 'PBI not found' });
    }

    if (pbi.stage === 'active_sprint') {
      return res.status(400).json({
        message: 'Cannot delete a PBI that is in the Active Sprint'
      });
    }

    const deletedPbi = await deletePbi(projectId, pbiId);
    if (!deletedPbi) {
      // Only reachable if the PBI was removed, or moved into Active Sprint,
      // between the check above and the DELETE.
      return res.status(409).json({
        message: 'The PBI changed while it was being deleted. Reload and try again.'
      });
    }

    return res.json({ pbi: deletedPbi });
  } catch (err) {
    if (PBI_STILL_REFERENCED.has(err?.code)) {
      return res.status(409).json({ message: stillReferencedMessage(err) });
    }
    return res.status(500).json({ message: 'Failed to delete the PBI' });
  }
}

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

    // US-11 (Yichi Zhang): Active Sprint -> Completed must go through the
    // complete-PBI action so actual hours and collaborators are recorded.
    if (targetStage === 'completed') {
      return res.status(400).json({
        message: 'Cannot move a PBI into Completed without recording actual hours. Complete the PBI instead.'
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
