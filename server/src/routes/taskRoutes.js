import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { editTaskController, deleteTaskController } from '../controllers/taskController.js';

// Mounted at /api/projects (see app.js), same base as pbiRoutes.js/boardRoutes.js.
const router = Router();

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// US-04a / SCRUM-121. requireRole('admin') here is its first real use in
// the codebase (see authMiddleware.js).
// TODO: insert requireProjectResponsibility after requireRole('admin') once
// US-04d's "admin responsible for project" data exists - right now this
// only checks the caller is an authenticated admin, not that they are
// responsible for this specific project. Tracked, not an oversight - see
// the US-04a implementation prompt's "Known gaps" #1.
router.patch(
  '/:projectId/pbis/:pbiId/tasks/:taskId',
  requireAuth,
  requireRole('admin'),
  editTaskController
);

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// Same requireProjectResponsibility TODO as above.
router.delete(
  '/:projectId/pbis/:pbiId/tasks/:taskId',
  requireAuth,
  requireRole('admin'),
  deleteTaskController
);

export default router;
