import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  createProjectController,
  listResponsibleProjectsController
} from '../controllers/projectController.js';

// Mounted at /api/projects (see app.js). Project-level routes that are not
// scoped to one existing project; the board, PBI and sprint routes under
// /api/projects/:projectId live in their own route files.
const router = Router();

// POST /api/projects
// US-04d / SCRUM-19. Admin-only: the creating Admin becomes the project's
// responsible Admin (see projectController.js). There is no :projectId yet,
// so requireProjectResponsibility does not apply here.
router.post('/', requireAuth, requireRole('admin'), createProjectController);

// GET /api/projects
// US-04c / SCRUM-17. Admin-only: the projects the logged-in Admin is
// responsible for (projects.responsible_admin_id = req.user.id), used to
// navigate to their boards. Developers get 403 here; their own project list
// comes from project membership (see dashboardController).
router.get('/', requireAuth, requireRole('admin'), listResponsibleProjectsController);

export default router;
