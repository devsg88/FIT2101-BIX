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
