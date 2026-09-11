import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBoardController } from '../controllers/boardController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/board
// Any authenticated user may read a board. Project-scoped read authorization
// (should a non-member be able to see another team's board?) is an open
// question tracked with requireProjectMembership in authMiddleware.js.
router.get('/:projectId/board', requireAuth, getBoardController);

export default router;
