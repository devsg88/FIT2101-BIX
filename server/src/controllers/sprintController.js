// Sprint mutation endpoints.
//
// Wired into routing for a stable frontend contract; workflow logic deferred.
//
// Deferred:
//   - startSprintController -> US-10 (start the planned sprint: move every PBI
//     currently in Sprint Planning into the Active Sprint together, in one
//     transaction, keeping planned dates / Estimated Hours / tasks / sub-tasks;
//     reject an empty sprint).
//
// Also needs project-membership authorization (see requireProjectMembership in
// ../middleware/authMiddleware.js) before it may change data.

// POST /api/projects/:projectId/sprints/:sprintId/start
export async function startSprintController(req, res) {
  return res
    .status(501)
    .json({ message: 'Starting a sprint is not implemented yet' });
}
