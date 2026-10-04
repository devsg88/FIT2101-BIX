import { Router } from 'express';
import {
  requireAuth,
  requireProjectAccess,
  requireRole,
  requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import {
  editTaskController,
  deleteTaskController,
  assignTaskController,
  completeSubTaskController,
  completeTaskController
} from '../controllers/taskController.js';
import { completePbiController } from '../controllers/completionController.js';
import {
  createTaskController, updateTaskController,
  createSubTaskController, updateSubTaskController,
  getPbiBreakdownController
} from '../controllers/breakdownController.js';

// Mounted at /api/projects (see app.js), same base as pbiRoutes.js/boardRoutes.js.
const router = Router();

router.get('/:projectId/pbis/:pbiId', requireAuth, requireProjectAccess, getPbiBreakdownController);
router.post('/:projectId/pbis/:pbiId/tasks', requireAuth, requireProjectAccess, createTaskController);
router.patch('/:projectId/tasks/:taskId', requireAuth, requireProjectAccess, updateTaskController);
router.post('/:projectId/tasks/:taskId/sub-tasks', requireAuth, requireProjectAccess, createSubTaskController);
router.patch('/:projectId/sub-tasks/:subTaskId', requireAuth, requireProjectAccess, updateSubTaskController);
// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// US-04a / SCRUM-121. Admin-only, and only for the Admin responsible for
// this project (requireProjectResponsibility, US-04d's
// projects.responsible_admin_id check). The controller still checks the
// PBI belongs to the project and the task to the PBI.
router.patch(
  '/:projectId/pbis/:pbiId/tasks/:taskId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  editTaskController
);

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// Same guards as above.
router.delete(
  '/:projectId/pbis/:pbiId/tasks/:taskId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  deleteTaskController
);

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/assignee
// US-04a / SCRUM-122. Same guards as above.
router.patch(
  '/:projectId/pbis/:pbiId/tasks/:taskId/assignee',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  assignTaskController
);

// POST /api/projects/:projectId/tasks/:taskId/complete
// US-11 - Yichi Zhang (SCRUM-128 / SCRUM-129)
router.post(
  '/:projectId/tasks/:taskId/complete',
  requireAuth,
  requireProjectAccess,
  completeTaskController
);

// POST /api/projects/:projectId/sub-tasks/:subTaskId/complete
router.post(
  '/:projectId/sub-tasks/:subTaskId/complete',
  requireAuth,
  requireProjectAccess,
  completeSubTaskController
);

// POST /api/projects/:projectId/pbis/:pbiId/complete
router.post(
  '/:projectId/pbis/:pbiId/complete',
  requireAuth,
  requireProjectAccess,
  completePbiController
);

export default router;
