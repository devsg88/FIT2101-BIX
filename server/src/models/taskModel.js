import { pool } from '../config/db.js';

// Task model (US-04a). Every task belongs to exactly one PBI (see
// server/db/schema.sql), so every read/write here is scoped by BOTH pbiId
// AND the task's own id - a taskId that happens to belong to a different
// PBI (or a different project entirely) can never be touched by accident,
// the WHERE clause simply matches no row and the caller gets null back,
// same convention as pbiModel.js's updatePbiStage/updatePbiPlanning.
//
// assignTask (SCRUM-122) is added to this same file in a later commit - it
// is still "the tasks table", just a different column being written.

const TASK_COLUMNS = `id, pbi_id, title, status, assignee_id`;

export async function getTaskById(pbiId, taskId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS}
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
      RETURNING ${TASK_COLUMNS}`,
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
      RETURNING ${TASK_COLUMNS}`,
    [assigneeId, taskId, pbiId]
  );
  return rows[0] ?? null;
}
