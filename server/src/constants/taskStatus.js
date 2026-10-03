// The status vocabulary for tasks and sub_tasks (US-04a / SCRUM-121),
// enforced at the database level by the CHECK constraints added in
// server/db/migrations/001_task_subtask_assignee_and_status.sql.
//
// This is the one place the backend defines the list, the same pattern
// already used for the PBI board stages (see ../constants/boardStages.js) -
// every file that needs to validate or display a task/sub-task status
// imports it from here rather than writing its own copy.
//
// Tasks and sub-tasks deliberately share one vocabulary. Nothing in the
// schema or the user story asks for a different set per resource, so one
// shared list is used instead of two copies that could drift apart.
export const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'done']);

const TASK_STATUS_SET = new Set(TASK_STATUSES);

export function isTaskStatus(value) {
  return TASK_STATUS_SET.has(value);
}

// Which status changes the generic Admin Edit (US-04a) may make. Completing
// work is owned by US-11's Complete actions, which enforce its prerequisites
// (Active Sprint, assigned developer, sub-tasks done, actual hours) and record
// actual_hours / completed_at - so Edit may move an item between todo and
// in_progress, and may keep an already-done item done (e.g. to fix its title),
// but may not move an item into done or reopen a done one.
//
// Returns null when the change is allowed, otherwise the message to send back.
// `item` is the noun for the message ('task' or 'sub-task').
export function editStatusTransitionError(currentStatus, nextStatus, item) {
  if (nextStatus === 'done' && currentStatus !== 'done') {
    return `A ${item} can only be marked done through the Complete action`;
  }
  if (currentStatus === 'done' && nextStatus !== 'done') {
    return `A completed ${item} cannot be reopened through Edit`;
  }
  return null;
}
