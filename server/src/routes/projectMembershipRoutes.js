import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { getProjectMembersController } from '../controllers/projectMembershipController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js). See projectMembershipController.js
// for why this route exists as part of US-04a/SCRUM-122.
const router = Router();

// GET /api/projects/:projectId/members
// Only an admin responsible for this project or a developer assigned to it
// may see who else is on it - same project-access rule as the board/PBI/
// sprint/task routes.
router.get('/:projectId/members', requireAuth, requireProjectAccess, asyncHandler(getProjectMembersController));

export default router;
