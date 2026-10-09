import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { getBurndownController } from '../controllers/burndownController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/sprints/:sprintId/burndown
// US-15 (SCRUM-153). Reuses the shared project access check from
// authMiddleware.js, the same one the board read uses: a Developer must be a
// member of the project, an Admin its responsible Admin. Anyone else gets
// 401/403/404 before the controller runs, so they never see burndown data.
router.get(
  '/:projectId/sprints/:sprintId/burndown',
  requireAuth,
  requireProjectAccess,
  getBurndownController
);

export default router;
