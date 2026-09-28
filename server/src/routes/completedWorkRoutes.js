import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getCompletedWorkController } from '../controllers/completedWorkController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/completed-work
// US-12: Completed Work History. Role/project-membership scoping (admin, or
// an assigned developer only) happens inside the controller, not here - see
// completedWorkController.js.
router.get('/:projectId/completed-work', requireAuth, getCompletedWorkController);

export default router;
