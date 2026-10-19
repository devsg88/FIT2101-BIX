import { Router } from 'express';
import {
  requireAuth, requireRole, requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import { getSprintAnalyticsController, getProjectAnalyticsController } from '../controllers/analyticsController.js';

const router = Router();

// All responsible projects; the model scopes both dimensions and hours to
// the verified admin id, rather than trusting a client-supplied project list.
router.get('/analytics', requireAuth, requireRole('admin'), getProjectAnalyticsController);

router.get(
  '/:projectId/analytics/sprints',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  getSprintAnalyticsController
);

export default router;
