import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { startSprintController } from '../controllers/sprintController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// POST /api/projects/:projectId/sprints/:sprintId/start
// US-10 - Yichi Zhang. Starts the planned sprint (bulk move into Active Sprint).
router.post(
  '/:projectId/sprints/:sprintId/start',
  requireAuth,
  requireProjectAccess,
  startSprintController
);

export default router;
