import { Router } from 'express';
import {
  requireAuth,
  requireRole,
  requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import {
  createPbiController,
  deletePbiController,
  listPbisController,
  moveStageController,
  updatePbiDetailsController,
  updatePlanningController
} from '../controllers/pbiController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/pbis
// US-04b. Admin-only, and only for the Admin responsible for this project:
// 401 without a token, 403 for a Developer or for an Admin who is not
// responsible for it, 404 if the project does not exist.
router.get(
  '/:projectId/pbis',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  listPbisController
);

// POST /api/projects/:projectId/pbis
// US-04b. Same guards as the GET above. Creating PBIs as an Admin is still a
// candidate requirement pending team confirmation (see the US-04b open
// question) - remove this route if it is not confirmed.
router.post(
  '/:projectId/pbis',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  createPbiController
);

// PATCH /api/projects/:projectId/pbis/:pbiId
// US-04b. Edits a PBI's title and/or description. Same guards as above.
router.patch(
  '/:projectId/pbis/:pbiId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  updatePbiDetailsController
);

// DELETE /api/projects/:projectId/pbis/:pbiId
// US-04b. Same guards as above. Refuses a PBI in Active Sprint (400) or one
// that still has tasks (409) - see deletePbiController.
router.delete(
  '/:projectId/pbis/:pbiId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  deletePbiController
);

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
// TODO: insert requireProjectMembership after requireAuth once project
// membership data exists (see authMiddleware.js) - right now this only
// checks the caller is logged in, not that they belong to this project.
router.patch('/:projectId/pbis/:pbiId/stage', requireAuth, moveStageController);

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
// US-08b — Yichi Zhang. Saves estimate and planned dates; does not change stage.
// TODO: insert requireProjectMembership after requireAuth once project
// membership data exists (see authMiddleware.js).
router.patch(
  '/:projectId/pbis/:pbiId/planning',
  requireAuth,
  updatePlanningController
);

export default router;
