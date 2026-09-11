import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  moveStageController,
  updatePlanningController
} from '../controllers/pbiController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
// TODO: insert requireProjectMembership after requireAuth once project
// membership data exists (see authMiddleware.js) - right now this only
// checks the caller is logged in, not that they belong to this project.
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
