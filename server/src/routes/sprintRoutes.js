import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { startSprintController } from '../controllers/sprintController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// POST /api/projects/:projectId/sprints/:sprintId/start
// TODO(US-10): insert requireProjectMembership after requireAuth and replace
// the deferred controller with real start-sprint logic.
router.post(
  '/:projectId/sprints/:sprintId/start',
  requireAuth,
  startSprintController
);

export default router;
