import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  editSubTaskController,
  deleteSubTaskController,
  assignSubTaskController
} from '../controllers/subTaskController.js';

// Mounted at /api/projects (see app.js). Nested one level deeper than
// taskRoutes.js - a sub-task's path carries its parent task's id too, so
// the hierarchy is checked PBI -> task -> sub-task on every request.
const router = Router();

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
// US-04a / SCRUM-121.
// TODO: same requireProjectResponsibility gap as taskRoutes.js, blocked on
// US-04d.
router.patch(
  '/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId',
  requireAuth,
  requireRole('admin'),
  editSubTaskController
);

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
router.delete(
  '/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId',
  requireAuth,
  requireRole('admin'),
  deleteSubTaskController
);

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId/assignee
// US-04a / SCRUM-122.
router.patch(
  '/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId/assignee',
  requireAuth,
  requireRole('admin'),
  assignSubTaskController
);

export default router;
