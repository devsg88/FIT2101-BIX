import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import {
  completeSubTaskController,
  completeTaskController
} from '../controllers/taskController.js';
import { completePbiController } from '../controllers/completionController.js';
import {
  createTaskController, updateTaskController,
  createSubTaskController, updateSubTaskController,
  getPbiBreakdownController
} from '../controllers/breakdownController.js';

const router = Router();

router.get('/:projectId/pbis/:pbiId', requireAuth, requireProjectAccess, getPbiBreakdownController);
router.post('/:projectId/pbis/:pbiId/tasks', requireAuth, requireProjectAccess, createTaskController);
router.patch('/:projectId/tasks/:taskId', requireAuth, requireProjectAccess, updateTaskController);
router.post('/:projectId/tasks/:taskId/sub-tasks', requireAuth, requireProjectAccess, createSubTaskController);
router.patch('/:projectId/sub-tasks/:subTaskId', requireAuth, requireProjectAccess, updateSubTaskController);

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
