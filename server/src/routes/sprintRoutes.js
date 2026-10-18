import { Router } from 'express';
import {
  requireAuth,
  requireProjectAccess,
  requireRole,
  requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import { createSprintController, startSprintController } from '../controllers/sprintController.js';

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
  createSprintController
);

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

export default router;
