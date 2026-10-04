import { describe, it, expect } from 'vitest';
import router from './pbiRoutes.js';

// Verifies middleware ordering: both routes here put requireAuth then
// requireProjectAccess in front of their controller. Previously these two
// routes ran with requireAuth only - any authenticated user, not just an
// admin or an assigned project member, could move or re-plan any project's
// PBIs. Inspects the actual Express Router object (same technique as
// taskRoutes.test.js) so a dropped or reordered middleware would fail this
// test even though authMiddleware.test.js's own tests of the guards would
// still pass.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('pbiRoutes', () => {
  it('guards PATCH .../pbis/:pbiId/stage with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/stage');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'moveStageController']);
  });

  it('guards PATCH .../pbis/:pbiId/planning with requireAuth then requireProjectAccess before the controller', () => {
    const names = middlewareNamesFor('patch', '/:projectId/pbis/:pbiId/planning');

    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'updatePlanningController']);
  });
});
