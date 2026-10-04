import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getProjectMembersController } from '../controllers/projectMembershipController.js';

// Mounted at /api/projects (see app.js). See projectMembershipController.js
// for why this route exists as part of US-04a/SCRUM-122.
const router = Router();

// GET /api/projects/:projectId/members
router.get('/:projectId/members', requireAuth, getProjectMembersController);

export default router;
