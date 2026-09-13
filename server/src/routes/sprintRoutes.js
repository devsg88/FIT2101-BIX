import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { startSprintController } from '../controllers/sprintController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// POST /api/projects/:projectId/sprints/:sprintId/start
// US-10 — Yichi Zhang. Starts the planned sprint (bulk move into Active Sprint).
// TODO: insert requireProjectMembership after requireAuth once project
// membership data exists (see authMiddleware.js).
router.post(
  '/:projectId/sprints/:sprintId/start',
  requireAuth,
  startSprintController
);

export default router;
