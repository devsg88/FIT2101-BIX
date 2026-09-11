import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  moveStageController,
  updatePlanningController
} from '../controllers/pbiController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
// TODO(US-08a / US-06): insert requireProjectMembership after requireAuth and
// replace the deferred controller with real transition logic.
router.patch('/:projectId/pbis/:pbiId/stage', requireAuth, moveStageController);

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
// TODO(US-08b): insert requireProjectMembership after requireAuth and replace
// the deferred controller with real planning capture + validation.
router.patch(
  '/:projectId/pbis/:pbiId/planning',
  requireAuth,
  updatePlanningController
);

export default router;
