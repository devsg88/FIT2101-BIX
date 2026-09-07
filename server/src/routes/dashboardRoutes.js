import { Router } from 'express';
import { getDashboardController } from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', requireAuth, getDashboardController);

export default router;
