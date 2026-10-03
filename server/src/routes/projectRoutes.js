import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { createProjectController } from '../controllers/projectController.js';

// Mounted at /api/projects (see app.js). Project-level routes that are not
// scoped to one existing project; the board, PBI and sprint routes under
// /api/projects/:projectId live in their own route files.
const router = Router();

// POST /api/projects
// US-04d / SCRUM-19. Admin-only: the creating Admin becomes the project's
// responsible Admin (see projectController.js). There is no :projectId yet,
// so requireProjectResponsibility does not apply here.
router.post('/', requireAuth, requireRole('admin'), createProjectController);

export default router;
