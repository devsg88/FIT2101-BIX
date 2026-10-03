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
    throw new Error(body.message || `Request failed with status ${res.status}`);
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

// --- Project board (Journey 3) ---------------------------------------------

// GET /api/projects/:projectId/board
export function getBoard(projectId, token) {
  return request(`/projects/${projectId}/board`, {
    headers: authHeader(token)
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

// PATCH /api/projects/:projectId/pbis/:pbiId/planning  (US-08b — Yichi Zhang)
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

// POST /api/projects/:projectId/sprints/:sprintId/start  (US-10 — Yichi Zhang)
// Moves every Sprint Planning PBI into Active Sprint together. Resolves with
// { sprint, pbis } on success, or throws (empty sprint, missing estimates, ...).
export function startSprint(projectId, sprintId, token) {
  return request(`/projects/${projectId}/sprints/${sprintId}/start`, {
    method: 'POST',
    headers: authHeader(token)
  });
}

// --- Tasks and sub-tasks (US-04a, SCRUM-121/122) ----------------------------

// PATCH /api/projects/:projectId/pbis/:pbiId/tasks/:taskId
// `payload` is { title, status }. Admin-only on the backend (requireRole);
// a non-admin caller gets the backend's 403 message back through `request`.
export function updateTask(projectId, pbiId, taskId, payload, token) {
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
export function updateSubTask(projectId, pbiId, taskId, subTaskId, payload, token) {
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
