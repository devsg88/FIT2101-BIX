import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { getBoardController } from '../controllers/boardController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/board
// The nested work is visible only to members or the responsible Admin.
router.get('/:projectId/board', requireAuth, requireProjectAccess, asyncHandler(getBoardController));

export default router;
