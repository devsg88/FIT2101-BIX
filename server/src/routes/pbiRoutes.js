import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import {
  moveStageController,
  updatePlanningController
} from '../controllers/pbiController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
router.patch(
  '/:projectId/pbis/:pbiId/stage',
  requireAuth,
  requireProjectAccess,
  moveStageController
);

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
// US-08b - Yichi Zhang. Saves estimate and planned dates; does not change stage.
router.patch(
  '/:projectId/pbis/:pbiId/planning',
  requireAuth,
  requireProjectAccess,
  updatePlanningController
);

export default router;
