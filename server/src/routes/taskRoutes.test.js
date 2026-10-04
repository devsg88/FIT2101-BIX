import { describe, it, expect } from 'vitest';
import router from './taskRoutes.js';

// These tests verify middleware ordering: that each US-04a route puts
// requireAuth, requireRole('admin') and requireProjectResponsibility in front
// of its controller, in that order. A typo or a dropped middleware in
// taskRoutes.js would not be caught by authMiddleware.test.js, which tests the
// guards' own behaviour generically. They inspect the actual Express Router
// object: requireAuth and requireProjectResponsibility keep their own names
// when passed by reference, and requireRole(...) returns a function
// explicitly named roleGuard (see authMiddleware.js) - so the middleware
// chain's function names prove the guards are really there, in the right order.
//
// The responsibility behaviour itself (403 / 404 / 400, and no write on a
// refused request) is covered over HTTP in taskRoutes.responsibility.test.js.
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
  it('guards PATCH .../tasks/:taskId with requireAuth, requireRole(\'admin\') then requireProjectResponsibility before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/tasks/:taskId');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'requireProjectResponsibility', 'editTaskController']);
  });

  it('guards DELETE .../tasks/:taskId with requireAuth, requireRole(\'admin\') then requireProjectResponsibility before the controller', () => {
    const names = middlewareNamesFor('delete', '/:projectId/pbis/:pbiId/tasks/:taskId');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'requireProjectResponsibility', 'deleteTaskController']);
  });

  it('guards PATCH .../tasks/:taskId/assignee with requireAuth, requireRole(\'admin\') then requireProjectResponsibility before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/tasks/:taskId/assignee');

    expect(names).toEqual(['requireAuth', 'roleGuard', 'requireProjectResponsibility', 'assignTaskController']);
  });

  // The three US-11 completion routes used to run with requireAuth only -
  // any authenticated user, not just an admin or an assigned project member,
  // could complete a task/sub-task/PBI on a project they had no access to.
  // requireProjectAccess now closes that the same way the US-04a routes
  // above are already guarded.
  it('guards POST .../tasks/:taskId/complete with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('post', '/:projectId/tasks/:taskId/complete');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'completeTaskController']);
  });

  it('guards POST .../sub-tasks/:subTaskId/complete with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('post', '/:projectId/sub-tasks/:subTaskId/complete');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'completeSubTaskController']);
  });

  it('guards POST .../pbis/:pbiId/complete with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('post', '/:projectId/pbis/:pbiId/complete');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'completePbiController']);
  });
});
