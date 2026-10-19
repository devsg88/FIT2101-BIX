import { Router } from 'express';
import {
  requireAuth,
  requireRole,
  requireProjectResponsibility,
  requireProjectAccess
} from '../middleware/authMiddleware.js';
import {
  createProjectController,
  listResponsibleProjectsController,
  updateProjectController,
  deleteProjectController,
  setCurrentFocusController
} from '../controllers/projectController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted at /api/projects (see app.js). Project-level routes that are not
// scoped to one existing project; the board, PBI and sprint routes under
// /api/projects/:projectId live in their own route files.
const router = Router();

// POST /api/projects
// US-04d / SCRUM-19. Admin-only: the creating Admin becomes the project's
// responsible Admin (see projectController.js). There is no :projectId yet,
// so requireProjectResponsibility does not apply here.
router.post('/', requireAuth, requireRole('admin'), asyncHandler(createProjectController));

// GET /api/projects
// US-04c / SCRUM-17. Admin-only: the projects the logged-in Admin is
// responsible for (projects.responsible_admin_id = req.user.id), used to
// navigate to their boards. Developers get 403 here; their own project list
// comes from project membership (see dashboardController).
router.get('/', requireAuth, requireRole('admin'), asyncHandler(listResponsibleProjectsController));

// PATCH /api/projects/:projectId   body: { name }
// US-04c / SCRUM-17. Renames the project (its board). Only the Admin
// responsible for the project (projects.responsible_admin_id) may do this.
router.patch(
  '/:projectId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  asyncHandler(updateProjectController)
);

// DELETE /api/projects/:projectId
// US-04c / SCRUM-17. Deletes the project (its board) while it has no PBIs or
// sprints - 409 otherwise. Only the Admin responsible for the project
// (projects.responsible_admin_id) may do this.
router.delete(
  '/:projectId',
  requireAuth,
  requireRole('admin'),
  requireProjectResponsibility,
  asyncHandler(deleteProjectController)
);

// PATCH /api/projects/:projectId/focus   body: { pbi_id }  (null clears it)
// US-07 / SCRUM-198. Sets or clears the project's Current Focus PBI. Open to
// the project's responsible Admin and its Developer members:
// requireProjectAccess answers 400 / 404 / 403 before the controller runs.
router.patch(
  '/:projectId/focus',
  requireAuth,
  requireProjectAccess,
  asyncHandler(setCurrentFocusController)
);

export default router;
