import { Router } from 'express';
import {
  requireAuth,
  requireRole,
  requireProjectAccess,
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
import { asyncHandler } from '../middleware/asyncHandler.js';

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
  asyncHandler(listPbisController)
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
  asyncHandler(createPbiController)
);

// PATCH /api/projects/:projectId/pbis/:pbiId
// US-04b. Edits a PBI's title and/or description. Same guards as above.
router.patch(
  '/:projectId/pbis/:pbiId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  asyncHandler(updatePbiDetailsController)
);

// DELETE /api/projects/:projectId/pbis/:pbiId
// US-04b. Same guards as above. Refuses a PBI in Active Sprint (400) or one
// that still has tasks (409) - see deletePbiController.
router.delete(
  '/:projectId/pbis/:pbiId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  asyncHandler(deletePbiController)
);

// The two board actions below are used by Developers AND Admins, so they use
// requireProjectAccess (authMiddleware.js), the same guard as the board read:
// a Developer must be a member of the project (project_members), an Admin
// must be its responsible Admin (projects.responsible_admin_id). Ownership is
// never taken from project_members.

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
router.patch(
  '/:projectId/pbis/:pbiId/stage',
  requireAuth,
  requireProjectAccess,
  asyncHandler(moveStageController)
);

// PATCH /api/projects/:projectId/pbis/:pbiId/planning
// US-08b — Yichi Zhang. Saves estimate and planned dates; does not change stage.
router.patch(
  '/:projectId/pbis/:pbiId/planning',
  requireAuth,
  requireProjectAccess,
  asyncHandler(updatePlanningController)
);

export default router;
