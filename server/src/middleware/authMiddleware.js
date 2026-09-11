import jwt from 'jsonwebtoken';

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
