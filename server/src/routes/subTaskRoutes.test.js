import { describe, it, expect } from 'vitest';
import router from './subTaskRoutes.js';

// Same reasoning as taskRoutes.test.js - see the comment there.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

const SUB_TASK_PATH = '/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId';

describe('subTaskRoutes', () => {
  it('guards PATCH .../sub-tasks/:subTaskId with requireAuth then requireRole(\'admin\')', () => {
    const names = middlewareNamesFor('patch', SUB_TASK_PATH);

    expect(names).toEqual(['requireAuth', 'roleGuard', 'editSubTaskController']);
  });

  it('guards DELETE .../sub-tasks/:subTaskId with requireAuth then requireRole(\'admin\')', () => {
    const names = middlewareNamesFor('delete', SUB_TASK_PATH);

    expect(names).toEqual(['requireAuth', 'roleGuard', 'deleteSubTaskController']);
  });

  it('guards PATCH .../sub-tasks/:subTaskId/assignee with requireAuth then requireRole(\'admin\')', () => {
    const names = middlewareNamesFor('patch', `${SUB_TASK_PATH}/assignee`);

    expect(names).toEqual(['requireAuth', 'roleGuard', 'assignSubTaskController']);
  });
});
