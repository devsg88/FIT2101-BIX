import { describe, it, expect } from 'vitest';
import router from './sprintRoutes.js';

// Verifies middleware ordering: requireAuth then requireProjectAccess sit in
// front of the controller. Previously this route ran with requireAuth only -
// any authenticated user, not just an admin or an assigned project member,
// could start any project's sprint. Inspects the actual Express Router
// object (same technique as taskRoutes.test.js/pbiRoutes.test.js) so a
// dropped or reordered middleware would fail this test even though
// authMiddleware.test.js's own tests of the guards would still pass.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('sprintRoutes', () => {
  it('guards POST .../sprints/:sprintId/start with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('post', '/:projectId/sprints/:sprintId/start');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'startSprintController']);
  });
});
