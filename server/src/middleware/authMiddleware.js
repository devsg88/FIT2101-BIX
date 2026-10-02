import jwt from 'jsonwebtoken';
import { getProjectResponsibility } from '../models/projectModel.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Restrict a route to one or more roles.
//
// Must be placed AFTER requireAuth in the middleware chain: it reads the role
// from req.user (the verified JWT payload) and never from the request body.
// Responds 401 if authentication has not run or produced no role, 403 if the
// authenticated user's role is not in the allowed list. It does not grant any
// role implicitly - admin included.
//
//   router.post('/x', requireAuth, requireRole('admin'), handler)
export function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user?.role) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: 'You do not have permission to perform this action' });
    }

    next();
  };
}

// INTEGRATION POINT - NOT IMPLEMENTED.
//
// The board workflow stories ("a permitted team member can ...") require
// knowing whether the authenticated user belongs to the team that owns a given
// project. This repository has no such data: there is no membership table, no
// project_members join, nothing linking a user to a project. A global role
// ('admin' | 'developer') does not establish membership of a specific project.
//
// Until that data model and the permission rules are agreed with the team that
// owns the users table, this guard refuses the request instead of guessing.
// When membership exists: replace the body with a real lookup
// (req.user.id + req.params.projectId -> membership row) and add this guard to
// the project-scoped mutation routes after requireAuth.
export function requireProjectMembership(req, res, next) {
  return res
    .status(501)
    .json({ message: 'Project membership checks are not implemented yet' });
}

// Restrict a project-scoped route to the Admin responsible for that project
// (US-04d - projects.responsible_admin_id, see server/db/schema.sql).
//
// Must be placed AFTER requireAuth and requireRole('admin'), which already
// reject a missing token (401) and a non-Admin (403) before any database
// lookup happens:
//
//   router.patch('/:projectId/...', requireAuth, requireRole('admin'),
//                requireProjectResponsibility, handler)
//
// The project is taken from the route's :projectId only, never from the body
// or query string, so a caller cannot point the check at a different project
// from the one the route acts on. Responds 400 for an invalid id, 404 if the
// project does not exist, and 403 if this Admin is not its responsible Admin
// (including a project with no responsible Admin at all). It only knows about
// projects - anything nested under a project (PBIs, tasks, ...) is for the
// route's own controller to scope to that project.
export async function requireProjectResponsibility(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const projectId = Number(req.params?.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const responsibility = await getProjectResponsibility(projectId, req.user.id);

    if (!responsibility) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!responsibility.isResponsible) {
      return res
        .status(403)
        .json({ message: 'You are not responsible for this project' });
    }
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res
      .status(500)
      .json({ message: 'Failed to check project responsibility' });
  }

  next();
}
