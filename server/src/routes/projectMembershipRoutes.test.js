import { describe, it, expect } from 'vitest';
import router from './projectMembershipRoutes.js';

function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  expect(layer).toBeTruthy();
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('projectMembershipRoutes', () => {
  it('guards GET .../members with requireAuth then requireProjectAccess before the controller', () => {
    expect(middlewareNamesFor('get', '/:projectId/members')).toEqual([
      'requireAuth',
      'requireProjectAccess',
      'getProjectMembersController'
    ]);
  });

  // US-03/US-05 gap closed: these three routes previously did not exist at
  // all. Admin-only + responsible-Admin-only, same pattern as every other
  // project-scoped mutation (pbiRoutes.js, taskRoutes.js, projectRoutes.js).
  it('guards GET .../available-developers with requireAuth, requireRole(admin), requireProjectResponsibility', () => {
    expect(middlewareNamesFor('get', '/:projectId/available-developers')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'getAvailableDevelopersController'
    ]);
  });

  it('guards POST .../members with requireAuth, requireRole(admin), requireProjectResponsibility', () => {
    expect(middlewareNamesFor('post', '/:projectId/members')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'addProjectMemberController'
    ]);
  });

  it('guards DELETE .../members/:userId with requireAuth, requireRole(admin), requireProjectResponsibility', () => {
    expect(middlewareNamesFor('delete', '/:projectId/members/:userId')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'removeProjectMemberController'
    ]);
  });
});
