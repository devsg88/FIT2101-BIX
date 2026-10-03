import { pool } from '../config/db.js';

const TASK_COLUMNS = `
  t.id, t.pbi_id, t.title, t.status,
  t.assignee_id, t.actual_hours, t.completed_at
`;

// US-11 — Yichi Zhang (SCRUM-127 / 128 / 129)
export async function getTaskById(projectId, taskId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS},
            p.id AS pbi_id,
            p.project_id,
            p.stage AS pbi_stage
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE t.id = $1 AND p.project_id = $2`,
    [taskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getTasksByPbi(projectId, pbiId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS}
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1 AND t.pbi_id = $2
      ORDER BY t.id`,
    [projectId, pbiId]
  );
  return rows;
}

export async function getSubTasksByTaskId(taskId) {
  const { rows } = await pool.query(
    `SELECT id, task_id, title, status
       FROM sub_tasks
      WHERE task_id = $1
      ORDER BY id`,
    [taskId]
  );
  return rows;
}

export async function completeTask(projectId, taskId, actualHours) {
  const { rows } = await pool.query(
    `UPDATE tasks t
        SET status = 'done',
            actual_hours = $1,
            completed_at = NOW()
       FROM product_backlog_items p
      WHERE t.id = $2
        AND t.pbi_id = p.id
        AND p.project_id = $3
      RETURNING ${TASK_COLUMNS}`,
    [actualHours, taskId, projectId]
  );
  return rows[0] ?? null;
}

export async function completeSubTask(projectId, subTaskId) {
  const { rows } = await pool.query(
    `UPDATE sub_tasks s
        SET status = 'done'
       FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1
        AND s.task_id = t.id
        AND p.project_id = $2
      RETURNING s.id, s.task_id, s.title, s.status`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTaskById(projectId, subTaskId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.status,
            p.project_id, p.stage AS pbi_stage
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1 AND p.project_id = $2`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

// Task model (US-04a). Every task belongs to exactly one PBI (see
// server/db/schema.sql), so every read/write here is scoped by BOTH pbiId
// AND the task's own id - a taskId that happens to belong to a different
// PBI (or a different project entirely) can never be touched by accident,
// the WHERE clause simply matches no row and the caller gets null back,
// same convention as pbiModel.js's updatePbiStage/updatePbiPlanning.
//
// assignTask (SCRUM-122) is added to this same file in a later commit - it
// is still "the tasks table", just a different column being written.
//
// Named getTaskInPbi / PBI_TASK_COLUMNS (not getTaskById / TASK_COLUMNS) so
// they sit alongside US-11's project-scoped getTaskById above: these queries
// use the bare `tasks` table, not the `t` alias US-11's column list needs.

const PBI_TASK_COLUMNS = `id, pbi_id, title, status, assignee_id`;

export async function getTaskInPbi(pbiId, taskId) {
  const { rows } = await pool.query(
    `SELECT ${PBI_TASK_COLUMNS}
       FROM tasks
      WHERE id = $1 AND pbi_id = $2`,
    [taskId, pbiId]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Writes title and status only - assignee_id is untouched here,
// that is assignTask's job (SCRUM-122), keeping "edit the task" and
// "(re)assign the task" as two separate, independently callable actions.
export async function updateTask(pbiId, taskId, { title, status }) {
  const { rows } = await pool.query(
    `UPDATE tasks
        SET title = $1,
            status = $2
      WHERE id = $3 AND pbi_id = $4
      RETURNING ${PBI_TASK_COLUMNS}`,
    [title, status, taskId, pbiId]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Deletes exactly one task row. Does NOT touch its sub-tasks:
// tasks.pbi_id and sub_tasks.task_id are both ON DELETE RESTRICT (see
// server/db/schema.sql, "Deletion behaviour"), so this DELETE fails at the
// database level while any sub-task still references this task. Callers
// (taskController.deleteTaskController) must delete the task's sub-tasks
// first via subTaskModel.deleteSubTasksByTaskId, then call this - bottom-up,
// same order server/db/README.md already documents for the schema generally.
export async function deleteTask(pbiId, taskId) {
  const { rowCount } = await pool.query(
    `DELETE FROM tasks WHERE id = $1 AND pbi_id = $2`,
    [taskId, pbiId]
  );
  return rowCount > 0;
}

// SCRUM-122. assigneeId may be null to unassign a task; a non-null value is
// expected to already have been checked by the controller against the
// project's member list (listProjectMembers in projectMembershipModel.js) -
// this function does not re-check that, it only writes the column.
export async function assignTask(pbiId, taskId, assigneeId) {
  const { rows } = await pool.query(
    `UPDATE tasks
        SET assignee_id = $1
      WHERE id = $2 AND pbi_id = $3
      RETURNING ${PBI_TASK_COLUMNS}`,
    [assigneeId, taskId, pbiId]
  );
  return rows[0] ?? null;
}
