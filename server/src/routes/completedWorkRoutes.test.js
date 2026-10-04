import { describe, it, expect } from 'vitest';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import { getCompletedWorkController } from '../controllers/completedWorkController.js';
import completedWorkRoutes from './completedWorkRoutes.js';

// US-12: proves authentication is enforced by the ROUTE itself, not just
// available as a function elsewhere. completedWorkController.test.js and
// authMiddleware.test.js each test their own piece in isolation (the
// controller's admin/membership logic, and requireAuth's 401 behaviour), but
// neither proves requireAuth is actually wired into this route ahead of the
// controller - it would be possible to delete that one argument from
// router.get(...) and every other test file would still pass. This is the
// test that would fail if that happened.
//
// This project has no supertest/integration-test setup (see server/db/README
// and every other *.test.js in this repo - all layer-isolated unit tests),
// so rather than introduce a new test dependency for one route, this reads
// Express's own Router internals directly: router.stack holds one Layer per
// registered route, and route.stack holds one Layer per handler attached to
// it, in the exact order they run.
describe('completedWorkRoutes', () => {
  it('registers GET /:projectId/completed-work', () => {
    const layer = completedWorkRoutes.stack.find(
      (entry) => entry.route?.path === '/:projectId/completed-work'
    );

    expect(layer).toBeDefined();
    expect(layer.route.methods.get).toBe(true);
  });

  it('runs requireAuth then requireProjectAccess before getCompletedWorkController, so neither an unauthenticated nor an unauthorized request ever reaches it', () => {
    const layer = completedWorkRoutes.stack.find(
      (entry) => entry.route?.path === '/:projectId/completed-work'
    );
    const handlerNames = layer.route.stack.map((handlerLayer) => handlerLayer.name);

    expect(handlerNames).toEqual([
      requireAuth.name,
      requireProjectAccess.name,
      getCompletedWorkController.name
    ]);
    // Equivalent, more direct check: each guard is literally the function
    // that runs at that position, by identity, not just by name.
    expect(layer.route.stack[0].handle).toBe(requireAuth);
    expect(layer.route.stack[1].handle).toBe(requireProjectAccess);
    expect(layer.route.stack[2].handle).toBe(getCompletedWorkController);
  });
});
