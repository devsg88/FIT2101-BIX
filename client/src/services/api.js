const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const { headers, ...rest } = options;

  const res = await fetch(`${BASE_URL}${path}`, {
    // Merge caller headers on top of the default Content-Type. Pulling `headers`
    // out of `options` first means the spread below cannot clobber this merged
    // object, so both Content-Type and Authorization survive on requests that
    // send a JSON body.
    headers: { 'Content-Type': 'application/json', ...headers },
    ...rest
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Request failed with status ${res.status}`);
    // Callers that need to tell "not permitted" apart from any other failure
    // (e.g. the Completed Work History sidebar showing a dedicated
    // access-denied message instead of a generic retry) can check this
    // without parsing the message text. Every existing caller only ever
    // reads err.message, so adding this is not a breaking change.
    err.status = res.status;
    throw err;
  }

  return res.json();
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export function login(credentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export function getDashboard(token) {
  return request('/dashboard', {
    headers: authHeader(token)
  });
}

// POST /api/projects  (US-04d, Admin only)
// Creates a project owned by the logged-in Admin. Only the name is sent; the
// server takes the responsible Admin from the token, never from the body.
// Resolves with { project } on success, or throws with the backend's
// rejection message (missing/blank name, not an Admin, ...).
export function createProject(name, token) {
  return request('/projects', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name })
  });
}

// GET /api/projects  (US-04c, Admin only)
// The projects the logged-in Admin is responsible for, as { projects: [{ id,
// name }] }. The server decides which projects those are from the token -
// nothing here says which Admin is asking. Throws with the backend's message
// on failure, like every other call in this file.
export function getResponsibleProjects(token) {
  return request('/projects', {
    headers: authHeader(token)
  });
}

// PATCH /api/projects/:projectId  (US-04c, responsible Admin only)
// Renames the project - its board's name. Only the name is sent; who may
// rename is decided by the server. Resolves with { project }, or throws with
// the backend's message (blank name, not responsible, ...).
export function updateProject(projectId, name, token) {
  return request(`/projects/${projectId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ name })
  });
}

// DELETE /api/projects/:projectId  (US-04c, responsible Admin only)
// Deletes the project - its board - only while it has no PBIs or sprints.
// Resolves with { message, id }, or throws with the backend's message (409
// when the board still has work, 403 when not responsible, ...).
export function deleteProject(projectId, token) {
  return request(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: authHeader(token)
  });
}

// PATCH /api/projects/:projectId/focus  (US-07, responsible Admin or member)
// Sets the project's Current Focus PBI, or clears it when pbiId is null.
// null is sent as an explicit JSON null - the server treats a missing
// pbi_id as a mistake (400), not as "clear". Resolves with
// { project: { id, current_focus_pbi_id } }, or throws with the backend's
// message (PBI not in this project, no access, ...).
export function updateProjectFocus(projectId, pbiId, token) {
  return request(`/projects/${projectId}/focus`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ pbi_id: pbiId ?? null })
  });
}

// --- Project board (Journey 3) ---------------------------------------------

// GET /api/projects/:projectId/board
export function getBoard(projectId, token) {
  return request(`/projects/${projectId}/board`, {
    headers: authHeader(token)
  });
}

// GET /api/projects/:projectId/pbis  (US-04b, SCRUM-151)
// The project's Product Backlog Items, for the Admin responsible for that
// project. Resolves with { pbis: [...] }, or throws with the backend's
// message (not logged in, not responsible for this project, not found, ...).
export function getProjectPbis(projectId, token) {
  return request(`/projects/${projectId}/pbis`, {
    headers: authHeader(token)
  });
}

// POST /api/projects/:projectId/pbis  (US-04b, SCRUM-101)
// `pbi` is { title, description? }. The server always creates it in the
// Product Backlog of the project in the URL. Resolves with { pbi }.
export function createPbi(projectId, pbi, token) {
  return request(`/projects/${projectId}/pbis`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(pbi)
  });
}

// PATCH /api/projects/:projectId/pbis/:pbiId  (US-04b, SCRUM-101)
// `changes` holds only the fields to change: { title?, description? }.
// Resolves with { pbi: <updated PBI> }.
export function updatePbi(projectId, pbiId, changes, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(changes)
  });
}

// DELETE /api/projects/:projectId/pbis/:pbiId  (US-04b, SCRUM-102)
// Resolves with { pbi: <the deleted PBI> }, or throws with the backend's
// message - e.g. the PBI is in the Active Sprint, or still has tasks.
export function deletePbi(projectId, pbiId, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}`, {
    method: 'DELETE',
    headers: authHeader(token)
  });
}

// GET /api/projects/:projectId/completed-work  (US-12)
// Resolves with { project, pbis: [...] } - pbis is every PBI moved to
// Completed, each with sprint_name (joined from sprint_id), its tasks/sub-tasks
// nested, and whatever completion data (actual_hours) US-11 has recorded.
// Throws (see `request` above) with status 403 if the caller is not an admin
// or an assigned member of this project, or 404 if the project does not exist.
export function getCompletedWork(projectId, token) {
  return request(`/projects/${projectId}/completed-work`, {
    headers: authHeader(token)
  });
}

export function getPbiBreakdown(projectId, pbiId, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}`, { headers: authHeader(token) });
}

export function createTask(projectId, pbiId, fields, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/tasks`, {
    method: 'POST', headers: authHeader(token), body: JSON.stringify(fields)
  });
}

export function updateTask(projectId, taskId, fields, token) {
  return request(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH', headers: authHeader(token), body: JSON.stringify(fields)
  });
}

export function createSubTask(projectId, taskId, fields, token) {
  return request(`/projects/${projectId}/tasks/${taskId}/sub-tasks`, {
    method: 'POST', headers: authHeader(token), body: JSON.stringify(fields)
  });
}

export function updateSubTask(projectId, subTaskId, fields, token) {
  return request(`/projects/${projectId}/sub-tasks/${subTaskId}`, {
    method: 'PATCH', headers: authHeader(token), body: JSON.stringify(fields)
  });
}

// PATCH /api/projects/:projectId/pbis/:pbiId/stage
// Moves a PBI to a new stage. `stage` is the target stage's machine name
// (e.g. 'sprint_planning'). Resolves with { pbi: <updated PBI> } on success,
// or throws (see `request` above) with the backend's rejection message if
// the move is not allowed by the workflow rules (US-06/US-08a), the PBI does
// not exist, or the request otherwise fails.
export function movePbi(projectId, pbiId, stage, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/stage`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ stage })
  });
}

// PATCH /api/projects/:projectId/pbis/:pbiId/planning  (US-08b  Yichi Zhang)
// `planning` is { planned_start_date, planned_end_date, estimated_hours }.
// Resolves with { pbi: <updated PBI> } on success, or throws with the
// backend's rejection message (invalid dates, hours, wrong stage, etc.).
export function updatePbiPlanning(projectId, pbiId, planning, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/planning`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(planning)
  });
}

// POST /api/projects/:projectId/sprints/:sprintId/start  (US-10  Yichi Zhang)
// Moves every Sprint Planning PBI into Active Sprint together. Resolves with
// { sprint, pbis } on success, or throws (empty sprint, missing estimates, ...).
export function startSprint(projectId, sprintId, token) {
  return request(`/projects/${projectId}/sprints/${sprintId}/start`, {
    method: 'POST',
    headers: authHeader(token)
  });
}

// PATCH /api/projects/:projectId/sprints/:sprintId/roles  (US-09)
// Saves the Scrum Master and Product Owner of a sprint - the work item the
// roles are attached to, so workItemId is the sprint id. null clears a role.
// Resolves with { sprint }. On failure it throws an Error carrying the
// server's message and err.status, so a caller can show the 400 for a
// Scrum Master who is not a real user on this project (AC4) as-is.
export function updateWorkItemRoles(projectId, workItemId, scrumMasterId, poIdentifier, token) {
  return request(`/projects/${projectId}/sprints/${workItemId}/roles`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({
      scrum_master_id: scrumMasterId ?? null,
      product_owner_identifier: poIdentifier ?? null
    })
  });
}

// --- Sprint burndown (US-15, SCRUM-153) -------------------------------------

// GET /api/projects/:projectId/sprints
// The project's Sprints for the Burndown view's picker. Resolves with
// { sprints: [{ id, name, status, started_at, ... }] }. Same access rule as
// the board: project member or responsible Admin.
export function getProjectSprints(projectId, token) {
  return request(`/projects/${projectId}/sprints`, {
    headers: authHeader(token)
  });
}

// GET /api/projects/:projectId/sprints/:sprintId/burndown
// Resolves with { sprint, totalPoints, remainingPoints, series, emptyReason }
// (contract in server/src/utils/burndown.js), or throws with the backend's
// message and status (403 no access, 404 Sprint not found, ...).
export function getSprintBurndown(projectId, sprintId, token) {
  return request(`/projects/${projectId}/sprints/${sprintId}/burndown`, {
    headers: authHeader(token)
  });
}

// --- Tasks and sub-tasks (US-04a, SCRUM-121/122) ----------------------------

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// `payload` is { title, status }. Admin-only on the backend (requireRole);
// a non-admin caller gets the backend's 403 message back through `request`.
export function updateTaskInPbi(projectId, pbiId, taskId, payload, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
}

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// Throws with the backend's message on a completed-PBI 409, a 404, etc.
export function deleteTask(projectId, pbiId, taskId, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: authHeader(token)
  });
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
export function updateSubTaskInTask(projectId, pbiId, taskId, subTaskId, payload, token) {
  return request(
    `/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}/sub-tasks/${subTaskId}`,
    {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify(payload)
    }
  );
}

// DELETE /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId
export function deleteSubTask(projectId, pbiId, taskId, subTaskId, token) {
  return request(
    `/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}/sub-tasks/${subTaskId}`,
    {
      method: 'DELETE',
      headers: authHeader(token)
    }
  );
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/assignee  (SCRUM-122)
// assigneeId may be null to unassign.
export function assignTask(projectId, pbiId, taskId, assigneeId, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}/assignee`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ assignee_id: assigneeId })
  });
}

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId/sub-tasks/:subTaskId/assignee
export function assignSubTask(projectId, pbiId, taskId, subTaskId, assigneeId, token) {
  return request(
    `/projects/${projectId}/pbis/${pbiId}/tasks/${taskId}/sub-tasks/${subTaskId}/assignee`,
    {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify({ assignee_id: assigneeId })
    }
  );
}

// GET /api/projects/:projectId/members  (SCRUM-122's own endpoint, added so
// this dropdown has something to source from). Resolves with { members }.
export function getProjectMembers(projectId, token) {
  return request(`/projects/${projectId}/members`, {
    headers: authHeader(token)
  });
}

// POST /api/projects/:projectId/tasks/:taskId/complete  (US-11 — Yichi Zhang)
export function completeTask(projectId, taskId, actualHours, token) {
  return request(`/projects/${projectId}/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ actual_hours: actualHours })
  });
}

export function completeSubTask(projectId, subTaskId, token) {
  return request(`/projects/${projectId}/sub-tasks/${subTaskId}/complete`, {
    method: 'POST',
    headers: authHeader(token)
  });
}

export function completePbi(projectId, pbiId, payload, token) {
  return request(`/projects/${projectId}/pbis/${pbiId}/complete`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload || {})
  });
}
