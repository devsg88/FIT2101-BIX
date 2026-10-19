import { getPbisByStage } from '../models/pbiModel.js';
import {
  createSprint,
  getSprintById,
  startSprint,
  updateSprintRoles
} from '../models/sprintModel.js';
import { findUserById } from '../models/userModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';
import { checkStageTransition } from '../constants/stageTransitions.js';

// US-10 Yichi Zhang
//
// startSprintController starts the planned sprint: every PBI currently in
// Sprint Planning is moved into Active Sprint together, in one transaction,
// keeping planned dates / Estimated Hours / tasks / sub-tasks. An empty
// sprint is rejected. Each PBI's move is still checked with
// checkStageTransition (the same shared guard moveStageController uses).
//
// Guarded by requireProjectAccess at the route (../routes/sprintRoutes.js):
// a Developer must be a member of the project, an Admin its responsible
// Admin.

function parseSprintName(body) {
  const rawName = body?.name;

  if (rawName === undefined || rawName === null) {
    return { error: 'A sprint name is required' };
  }
  if (typeof rawName !== 'string') {
    return { error: 'The sprint name must be text' };
  }

  const name = rawName.trim();
  if (name === '') {
    return { error: 'A sprint name is required' };
  }

  return { name };
}

// POST /api/projects/:projectId/sprints   body: { name }
//
// US-10 gap closed (NFR-01 frontend audit): the only way to get a sprint
// row into the database used to be db/seed.sql. Admin-only, and only the
// Admin responsible for this project (requireProjectResponsibility at the
// route, ../routes/sprintRoutes.js) - the project's existence is already
// confirmed by that middleware, same convention createPbiController uses,
// so this does not re-check it. Always created with status 'planning' (the
// schema default) - Start Sprint is a separate, later action.
export async function createSprintController(req, res) {
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  const parsed = parseSprintName(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const sprint = await createSprint(projectId, parsed.name);
    return res.status(201).json({ sprint });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create the sprint' });
  }
}

function hasPlanningDetails(pbi) {
  return (
    pbi.estimated_hours != null &&
    pbi.planned_start_date != null &&
    pbi.planned_end_date != null
  );
}

// POST /api/projects/:projectId/sprints/:sprintId/start
export async function startSprintController(req, res) {
  const projectId = Number(req.params.projectId);
  const sprintId = Number(req.params.sprintId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(sprintId) || sprintId <= 0) {
    return res.status(400).json({ message: 'A valid sprintId is required' });
  }

  try {
    const sprint = await getSprintById(projectId, sprintId);
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    // A sprint that is already active or completed cannot be started again.
    if (sprint.status !== 'planning') {
      return res.status(400).json({ message: 'Only a sprint still in planning can be started' });
    }

    // All Sprint Planning PBIs in this project move together. Items still
    // sitting in Product Backlog are left where they are.
    const planningPbis = await getPbisByStage(projectId, 'sprint_planning');
    if (planningPbis.length === 0) {
      return res.status(400).json({ message: 'Cannot start an empty sprint' });
    }

    // US-08b must have run on every item first: Start Sprint does not invent
    // estimates or dates, it only changes stage (and records sprint_id).
    if (planningPbis.some((pbi) => !hasPlanningDetails(pbi))) {
      return res.status(400).json({
        message: 'Every item in Sprint Planning needs estimate and dates before the sprint can start'
      });
    }

    for (const pbi of planningPbis) {
      const transition = checkStageTransition(pbi.stage, 'active_sprint');
      if (!transition.allowed) {
        return res.status(400).json({ message: transition.reason });
      }
    }

    const started = await startSprint(projectId, sprintId);
    if (!started) {
      // Race: the sprint left "planning" between the check above and the UPDATE.
      return res.status(400).json({ message: 'Only a sprint still in planning can be started' });
    }

    return res.json(started);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to start the sprint' });
  }
}

// --- US-09 (SCRUM-177): Scrum Master & Product Owner on a sprint -----------

const PRODUCT_OWNER_MAX_LENGTH = 255;

// PostgreSQL "foreign_key_violation".
const FOREIGN_KEY_VIOLATION = '23503';

// Reads the two roles from the body. Each one is optional, but at least one
// must be sent:
//   scrum_master_id           positive whole number, or null to clear
//   product_owner_identifier  text up to 255 characters, or null (or blank)
//                             to clear
// Returns { changes } in the shape updateSprintRoles takes, or { error }.
function parseRolesPayload(body) {
  const changes = {};
  const rawScrumMaster = body?.scrum_master_id;
  const rawProductOwner = body?.product_owner_identifier;

  if (rawScrumMaster === undefined && rawProductOwner === undefined) {
    return { error: 'Send scrum_master_id and/or product_owner_identifier' };
  }

  if (rawScrumMaster !== undefined) {
    if (
      rawScrumMaster !== null &&
      (typeof rawScrumMaster !== 'number' ||
        !Number.isSafeInteger(rawScrumMaster) ||
        rawScrumMaster <= 0)
    ) {
      return { error: 'scrum_master_id must be a user id or null' };
    }
    changes.scrumMasterId = rawScrumMaster;
  }

  if (rawProductOwner !== undefined) {
    if (rawProductOwner !== null && typeof rawProductOwner !== 'string') {
      return { error: 'product_owner_identifier must be text or null' };
    }
    const trimmed = rawProductOwner === null ? '' : rawProductOwner.trim();
    if (trimmed.length > PRODUCT_OWNER_MAX_LENGTH) {
      return {
        error: `product_owner_identifier must be at most ${PRODUCT_OWNER_MAX_LENGTH} characters`
      };
    }
    changes.productOwnerIdentifier = trimmed === '' ? null : trimmed;
  }

  return { changes };
}

// AC4: never accept a Scrum Master who is not a real user. The id is looked
// up in the users table, and the user must also be on this project - a
// Developer member, or the project's responsible Admin - so a sprint cannot
// be tagged with someone from another project.
// Returns null when the user is fine, or the message for a 400.
async function checkScrumMaster(projectId, userId) {
  const user = await findUserById(userId);
  if (!user) {
    return 'The Scrum Master must be an existing user';
  }

  const onProject =
    user.role === 'admin'
      ? (await getProjectResponsibility(projectId, user.id))?.isResponsible === true
      : await isProjectMember(projectId, user.id);

  if (!onProject) {
    return 'The Scrum Master must be a member of this project';
  }
  return null;
}

// PATCH /api/projects/:projectId/sprints/:sprintId/roles
//   body: { scrum_master_id?, product_owner_identifier? }
// US-09 / SCRUM-177. Sets or clears the sprint's Scrum Master and Product
// Owner. The route runs requireAuth and requireProjectAccess first, so the
// project exists and the caller may work on it.
//
// 200: roles saved - { sprint }
// 400: bad body, bad sprintId, or a Scrum Master who is not a real user on
//      this project
// 404: no such sprint in this project
// 500: database error
export async function updateSprintRolesController(req, res) {
  const projectId = Number(req.params.projectId);
  const sprintId = Number(req.params.sprintId);

  if (!Number.isSafeInteger(sprintId) || sprintId <= 0) {
    return res.status(400).json({ message: 'A valid sprintId is required' });
  }

  const parsed = parseRolesPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const sprint = await getSprintById(projectId, sprintId);
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const { scrumMasterId } = parsed.changes;
    if (scrumMasterId !== undefined && scrumMasterId !== null) {
      const problem = await checkScrumMaster(projectId, scrumMasterId);
      if (problem) {
        return res.status(400).json({ message: problem });
      }
    }

    const updated = await updateSprintRoles(projectId, sprintId, parsed.changes);
    if (!updated) {
      // Only reachable if the sprint was removed after the check above.
      return res.status(404).json({ message: 'Sprint not found' });
    }
    return res.json({ sprint: updated });
  } catch (err) {
    if (err.code === FOREIGN_KEY_VIOLATION) {
      // The Scrum Master was deleted between the check and the update; the
      // foreign key refused it, so nothing was saved.
      return res.status(400).json({ message: 'The Scrum Master must be an existing user' });
    }
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to update the sprint roles' });
  }
}
