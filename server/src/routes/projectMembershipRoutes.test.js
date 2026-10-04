import { describe, it, expect } from 'vitest';
import router from './projectMembershipRoutes.js';

describe('projectMembershipRoutes', () => {
  it('guards GET .../members with requireAuth then requireProjectAccess before the controller', () => {
    const layer = router.stack.find(
      (entry) => entry.route?.path === '/:projectId/members' && entry.route.methods.get
    );

    expect(layer).toBeTruthy();
    const names = layer.route.stack.map((entry) => entry.handle.name);
    expect(names).toEqual(['requireAuth', 'requireProjectAccess', 'getProjectMembersController']);
  });
});
