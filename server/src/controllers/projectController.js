import {
  createProject,
  listProjectsForResponsibleAdmin,
  updateProjectName,
  deleteEmptyProject,
  setCurrentFocus
} from '../models/projectModel.js';

// Project creation (US-04d / SCRUM-19).
//
// The route (see ../routes/projectRoutes.js) is requireAuth +
// requireRole('admin'), so by the time this runs req.user is a verified
// Admin. That Admin becomes the project's responsible Admin: the owner always
// comes from req.user.id (the verified JWT payload), never from the request
// body, so a caller cannot create a project on someone else's behalf.
//
// No board is created here because there is nothing to create: a project's
// board is its four fixed stages (../constants/boardStages.js) applied to its
// PBIs, so a new project with zero PBIs already has its empty four-stage
// board (see getBoardController).
//
// Project names are not required to be unique - no such rule exists in the
// agreed requirements - so no duplicate-name check is made here.

// Pulls the project name out of the request body and turns any problem into
// a message the controller can send as a 400. Only `name` is read; anything
// else in the body (e.g. responsible_admin_id) is ignored.
function parseProjectPayload(body) {
  const rawName = body?.name;

  if (rawName === undefined || rawName === null) {
    return { error: 'A project name is required' };
  }

  if (typeof rawName !== 'string') {
    return { error: 'The project name must be text' };
  }

  const name = rawName.trim();
  if (name === '') {
    return { error: 'A project name is required' };
  }

  return { name };
}

// POST /api/projects
export async function createProjectController(req, res) {
  const parsed = parseProjectPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const project = await createProject(parsed.name, req.user.id);
    return res.status(201).json({ project });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message,
    // the same convention the other controllers use.
    return res.status(500).json({ message: 'Failed to create the project' });
  }
}

// GET /api/projects
// US-04c / SCRUM-17. The projects the logged-in Admin is responsible for, so
// they can find and open those boards. Admin-only (see projectRoutes.js), and
// always scoped to req.user.id from the verified token - there is no way to
// ask for another Admin's list, and an Admin never sees projects they are not
// responsible for.
export async function listResponsibleProjectsController(req, res) {
  try {
    const projects = await listProjectsForResponsibleAdmin(req.user.id);
    return res.json({ projects });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to load your projects' });
  }
}

// PATCH /api/projects/:projectId
// US-04c / SCRUM-17. Renames the project, which is its board's name - the one
// board-level setting this schema has (the four stages are fixed). The route
// (projectRoutes.js) runs requireAuth, requireRole('admin') and
// requireProjectResponsibility first, so who may rename is already decided:
// this only validates the name, using the same rules as creating a project.
// Only `name` is read from the body - responsible_admin_id or anything else
// sent is ignored, so a rename can never change who owns the project.
export async function updateProjectController(req, res) {
  const parsed = parseProjectPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const project = await updateProjectName(Number(req.params.projectId), parsed.name);
    if (!project) {
      // Only reachable if the project was removed after the responsibility
      // check - treated as "not found", same as the other controllers.
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.json({ project });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to rename the project' });
  }
}

// DELETE /api/projects/:projectId
// US-04c / SCRUM-17. Deletes the project - its board - but only while it has
// no work (no PBIs or sprints); otherwise 409, and nothing is deleted. The
// route runs requireAuth, requireRole('admin') and requireProjectResponsibility
// first, so who may delete is already decided here.
export async function deleteProjectController(req, res) {
  const projectId = Number(req.params.projectId);

  try {
    const outcome = await deleteEmptyProject(projectId);

    if (outcome === 'has_work') {
      return res.status(409).json({
        message: 'This board still has work (PBIs or sprints) and cannot be deleted'
      });
    }
    if (outcome === 'not_found') {
      // Only reachable if the project was removed after the responsibility check.
      return res.status(404).json({ message: 'Project not found' });
    }

    // 200 with a body (not 204), matching the task/sub-task delete endpoints and
    // the client's request() helper, which reads JSON from every success.
    return res.json({ message: 'Project deleted', id: projectId });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to delete the project' });
  }
}

// Pulls the focus PBI id out of the request body for the Current Focus route.
// `pbi_id` must be sent: a positive whole number sets the focus, null clears
// it. A missing field is an error rather than "clear", so a typo in the field
// name cannot wipe the focus by accident.
function parseFocusPayload(body) {
  if (body?.pbi_id === undefined) {
    return { error: 'pbi_id is required (a PBI id, or null to clear the focus)' };
  }

  const pbiId = body.pbi_id;
  if (pbiId === null) {
    return { pbiId: null };
  }

  if (typeof pbiId !== 'number' || !Number.isSafeInteger(pbiId) || pbiId <= 0) {
    return { error: 'pbi_id must be a positive whole number or null' };
  }

  return { pbiId };
}

// PATCH /api/projects/:projectId/focus   body: { pbi_id }
// US-07 / SCRUM-198. Sets or clears the project's Current Focus PBI. The
// route runs requireAuth and requireProjectAccess first, so the project
// exists (404 otherwise) and the user is its responsible Admin or a
// Developer member (403 otherwise). This only validates the body and checks
// that the PBI is in this project.
//
// 200: focus set or cleared
// 400: pbi_id missing or not a positive whole number / null
// 404: the PBI is not in this project (or the project was removed after the
//      access check)
// 500: database error
export async function setCurrentFocusController(req, res) {
  const parsed = parseFocusPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const project = await setCurrentFocus(Number(req.params.projectId), parsed.pbiId);
    if (!project) {
      return res.status(404).json({ message: 'PBI not found in this project' });
    }
    return res.json({ project });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to update the current focus' });
  }
}
