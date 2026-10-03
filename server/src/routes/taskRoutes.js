import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  completeSubTaskController,
  completeTaskController
} from '../controllers/taskController.js';
import { completePbiController } from '../controllers/completionController.js';

const router = Router();

// POST /api/projects/:projectId/tasks/:taskId/complete
// US-11 — Yichi Zhang (SCRUM-128 / SCRUM-129)
router.post(
  '/:projectId/tasks/:taskId/complete',
  requireAuth,
  completeTaskController
);

// POST /api/projects/:projectId/sub-tasks/:subTaskId/complete
router.post(
  '/:projectId/sub-tasks/:subTaskId/complete',
  requireAuth,
  completeSubTaskController
);

// POST /api/projects/:projectId/pbis/:pbiId/complete
router.post(
  '/:projectId/pbis/:pbiId/complete',
  requireAuth,
  completePbiController
);

export default router;
