import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { getCompletedWorkController } from '../controllers/completedWorkController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/completed-work
// US-12: Completed Work History. Access is the admin responsible for the
// project, or a developer assigned to it - requireProjectAccess enforces
// that here, the same shared middleware every other project-scoped route
// uses; completedWorkController.js no longer does its own version of this
// check.
router.get(
  '/:projectId/completed-work',
  requireAuth,
  requireProjectAccess,
  asyncHandler(getCompletedWorkController)
);

export default router;
