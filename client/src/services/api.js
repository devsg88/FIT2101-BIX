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

// --- Project board (Journey 3) ---------------------------------------------

// GET /api/projects/:projectId/board
export function getBoard(projectId, token) {
  return request(`/projects/${projectId}/board`, {
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
