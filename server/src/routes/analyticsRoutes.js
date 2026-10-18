import { Router } from 'express';
import {
  requireAuth, requireRole, requireProjectResponsibility
} from '../middleware/authMiddleware.js';
import { getSprintAnalyticsController } from '../controllers/analyticsController.js';

const router = Router();

router.get(
  '/:projectId/analytics/sprints',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  getSprintAnalyticsController
);

export default router;
