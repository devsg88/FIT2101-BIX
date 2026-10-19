import { Router } from 'express';
import {
  requireAuth,
  requireProjectAccess,
  requireRole,
  requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import {
  createSprintController,
  startSprintController,
  updateSprintRolesController
} from '../controllers/sprintController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// POST /api/projects/:projectId/sprints   body: { name }
// US-10 gap closed (NFR-01 frontend audit): the only way to create a sprint
// row used to be db/seed.sql. Admin-only, and only the Admin responsible for
// this project - same guard as creating a PBI/task (structural setup), not
// requireProjectAccess like the workflow actions below: naming a new Sprint
// is a planning decision, not a routine board click either role makes.
router.post(
  '/:projectId/sprints',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  asyncHandler(createSprintController)
);

// POST /api/projects/:projectId/sprints/:sprintId/start
// US-10 — Yichi Zhang. Starts the planned sprint (bulk move into Active Sprint).
// Developers and Admins both start sprints, so this uses requireProjectAccess
// like the board read: Developer = project member, Admin = responsible Admin.
router.post(
  '/:projectId/sprints/:sprintId/start',
  requireAuth,
  requireProjectAccess,
  asyncHandler(startSprintController)
);

// PATCH /api/projects/:projectId/sprints/:sprintId/roles
//   body: { scrum_master_id?, product_owner_identifier? }
// US-09 / SCRUM-177. Sets or clears the sprint's Scrum Master and Product
// Owner. Same access as starting a sprint: Developer = project member, Admin
// = responsible Admin. The controller refuses a Scrum Master who is not a
// real user on this project.
router.patch(
  '/:projectId/sprints/:sprintId/roles',
  requireAuth,
  requireProjectAccess,
  asyncHandler(updateSprintRolesController)
);

export default router;
