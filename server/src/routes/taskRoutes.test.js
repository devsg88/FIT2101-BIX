import { describe, it, expect } from 'vitest';
import router from './taskRoutes.js';

// This codebase has no HTTP-level (supertest-style) test setup anywhere -
// every existing *.test.js either unit-tests a controller against a mocked
// model, or a model against a mocked pool (see pbiController.test.js /
// pbiModel.test.js). requireRole('admin')'s own behaviour (403 for a
// non-admin, next() for an admin) is already fully covered generically in
// authMiddleware.test.js and is not re-tested here.
//
// What IS specific to SCRUM-121/122, and worth a real test, is that these
// two routes actually put requireAuth and requireRole('admin') in front of
// their controllers - that wiring is exactly what "confirming a non-admin
// is blocked" depends on, and a typo or a dropped middleware in taskRoutes.js
// would not be caught by authMiddleware.test.js at all. Rather than add a
// new HTTP-testing dependency (supertest) just for this, this inspects the
// actual Express Router object: requireAuth keeps its own name when passed
// by reference, and requireRole(...) returns a function explicitly named
// roleGuard (see authMiddleware.js) - so the middleware chain's function
// names prove both guards are really there, in the right order.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('taskRoutes', () => {
  it('guards PATCH .../tasks/:taskId with requireAuth then requireRole(\'admin\') before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/tasks/:taskId');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'editTaskController']);
  });

  it('guards DELETE .../tasks/:taskId with requireAuth then requireRole(\'admin\') before the controller', () => {
    const names = middlewareNamesFor('delete', '/:projectId/pbis/:pbiId/tasks/:taskId');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'deleteTaskController']);
  });

  it('guards PATCH .../tasks/:taskId/assignee with requireAuth then requireRole(\'admin\') before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/tasks/:taskId/assignee');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'assignTaskController']);
  });
});
