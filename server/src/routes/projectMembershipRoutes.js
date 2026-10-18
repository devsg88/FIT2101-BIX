import { Router } from 'express';
import {
  requireAuth,
  requireProjectAccess,
  requireRole,
  requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import {
  addProjectMemberController,
  getAvailableDevelopersController,
  getProjectMembersController,
  removeProjectMemberController
} from '../controllers/projectMembershipController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js). See projectMembershipController.js
// for why this route exists as part of US-04a/SCRUM-122.
const router = Router();

// GET /api/projects/:projectId/members
// Only an admin responsible for this project or a developer assigned to it
// may see who else is on it - same project-access rule as the board/PBI/
// sprint/task routes.
router.get('/:projectId/members', requireAuth, requireProjectAccess, asyncHandler(getProjectMembersController));

// GET /api/projects/:projectId/available-developers
// Admin-only, and only the Admin responsible for this project - same guards
// as the mutation routes below, since this list only exists to feed them.
router.get(
  '/:projectId/available-developers',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  getAvailableDevelopersController
);

// POST /api/projects/:projectId/members   body: { user_id }
// Admin-only, and only the Admin responsible for this project - same
// pattern as every other project-scoped admin mutation (pbiRoutes.js,
// taskRoutes.js, projectRoutes.js).
router.post(
  '/:projectId/members',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  addProjectMemberController
);

// DELETE /api/projects/:projectId/members/:userId
router.delete(
  '/:projectId/members/:userId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  removeProjectMemberController
);

export default router;
