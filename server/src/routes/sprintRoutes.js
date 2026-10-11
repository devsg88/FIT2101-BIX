import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import {
  startSprintController,
  updateSprintRolesController
} from '../controllers/sprintController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// POST /api/projects/:projectId/sprints/:sprintId/start
// US-10 — Yichi Zhang. Starts the planned sprint (bulk move into Active Sprint).
// Developers and Admins both start sprints, so this uses requireProjectAccess
// like the board read: Developer = project member, Admin = responsible Admin.
router.post(
  '/:projectId/sprints/:sprintId/start',
  requireAuth,
  requireProjectAccess,
  startSprintController
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
  updateSprintRolesController
);

export default router;
