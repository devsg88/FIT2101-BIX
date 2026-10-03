import { createProject } from '../models/projectModel.js';

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
