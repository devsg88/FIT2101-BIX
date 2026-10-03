import { Router } from 'express';
import {
  requireAuth,
  requireAdminProjectResponsibility
} from '../middleware/authMiddleware.js';
import { getBoardController } from '../controllers/boardController.js';

// Mounted at /api/projects (see app.js).
const router = Router();

// GET /api/projects/:projectId/board
// US-04c / SCRUM-17: an Admin may only read the board of a project they are
// responsible for (projects.responsible_admin_id) - 403 otherwise, 404 for a
// project that does not exist. Every other role passes that check unchanged.
// Developer access is project membership (US-05): that check is an open item
// tracked with requireProjectMembership in authMiddleware.js, and is meant to
// sit between requireAuth and requireAdminProjectResponsibility here.
router.get(
  '/:projectId/board',
  requireAuth,
  requireAdminProjectResponsibility,
  getBoardController
);

export default router;
