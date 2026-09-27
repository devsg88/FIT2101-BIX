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
