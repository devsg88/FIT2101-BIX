import { describe, it, expect } from 'vitest';
import router from './teamRoutes.js';

function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  expect(layer).toBeTruthy();
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('teamRoutes', () => {
  it('guards GET / with requireAuth then requireRole(admin)', () => {
    expect(middlewareNamesFor('get', '/')).toEqual([
      'requireAuth',
      'roleGuard',
      'getTeamsController'
    ]);
  });

  it('guards GET /:teamId/members with requireAuth then requireRole(admin)', () => {
    expect(middlewareNamesFor('get', '/:teamId/members')).toEqual([
      'requireAuth',
      'roleGuard',
      'getTeamMembersController'
    ]);
  });

  it('guards GET /:teamId/available-developers with requireAuth then requireRole(admin)', () => {
    expect(middlewareNamesFor('get', '/:teamId/available-developers')).toEqual([
      'requireAuth',
      'roleGuard',
      'getAvailableDevelopersForTeamController'
    ]);
  });

  it('guards POST /:teamId/members with requireAuth then requireRole(admin)', () => {
    expect(middlewareNamesFor('post', '/:teamId/members')).toEqual([
      'requireAuth',
      'roleGuard',
      'addTeamMemberController'
    ]);
  });

  it('guards DELETE /:teamId/members/:userId with requireAuth then requireRole(admin)', () => {
    expect(middlewareNamesFor('delete', '/:teamId/members/:userId')).toEqual([
      'requireAuth',
      'roleGuard',
      'removeTeamMemberController'
    ]);
  });
});
