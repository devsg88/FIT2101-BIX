import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  addTeamMemberController,
  getAvailableDevelopersForTeamController,
  getTeamMembersController,
  getTeamsController,
  removeTeamMemberController
} from '../controllers/teamController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/teams (see app.js). Admin-only throughout: every page that
// reaches these routes (AdminSidebar's team list, TeamDetail.jsx) is already
// admin-only on the frontend, and a team has no "responsible admin" the way
// a project does, so there is no finer-grained guard to add on top of role.
const router = Router();

router.get('/', requireAuth, requireRole('admin'), asyncHandler(getTeamsController));

router.get(
  '/:teamId/members',
  requireAuth,
  requireRole('admin'),
  asyncHandler(getTeamMembersController)
);

router.get(
  '/:teamId/available-developers',
  requireAuth,
  requireRole('admin'),
  asyncHandler(getAvailableDevelopersForTeamController)
);

router.post(
  '/:teamId/members',
  requireAuth,
  requireRole('admin'),
  asyncHandler(addTeamMemberController)
);

router.delete(
  '/:teamId/members/:userId',
  requireAuth,
  requireRole('admin'),
  asyncHandler(removeTeamMemberController)
);

export default router;
