import { Router } from 'express';
import { getDashboardController } from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(getDashboardController));

export default router;
