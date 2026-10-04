import { pool } from '../config/db.js';

// Sub-task model (US-04a). Mirrors taskModel.js exactly, one level down:
// every sub-task belongs to exactly one task, so every read/write here is
// scoped by BOTH taskId AND the sub-task's own id.

const SUB_TASK_COLUMNS = `id, task_id, title, description, status, assignee_id`;

export async function getSubTaskById(taskId, subTaskId) {
  const { rows } = await pool.query(
    `SELECT ${SUB_TASK_COLUMNS}
       FROM sub_tasks
      WHERE id = $1 AND task_id = $2`,
    [subTaskId, taskId]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Writes title and status only - see the same note on
// taskModel.updateTask about assignee_id being a separate action.
export async function updateSubTask(taskId, subTaskId, { title, status }) {
  const { rows } = await pool.query(
    `UPDATE sub_tasks
        SET title = $1,
            status = $2
      WHERE id = $3 AND task_id = $4
      RETURNING ${SUB_TASK_COLUMNS}`,
    [title, status, subTaskId, taskId]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Sub-tasks are the bottom of the hierarchy (nothing references
// sub_tasks.id as a parent), so unlike deleteTask this needs no child
// clean-up first - a single DELETE is always safe against the RESTRICT FKs.
export async function deleteSubTask(taskId, subTaskId) {
  const { rowCount } = await pool.query(
    `DELETE FROM sub_tasks WHERE id = $1 AND task_id = $2`,
    [subTaskId, taskId]
  );
  return rowCount > 0;
}

// SCRUM-121 delete-order helper for taskModel.deleteTask's caller
// (taskController.deleteTaskController): removes every sub-task under one
// task so the task's own RESTRICT-guarded DELETE can then succeed. Not
// scoped to a return value - the caller only needs this to have happened
// before it deletes the task itself.
export async function deleteSubTasksByTaskId(taskId) {
  await pool.query(`DELETE FROM sub_tasks WHERE task_id = $1`, [taskId]);
}

// SCRUM-122. subTaskId may be null to unassign - see taskModel.assignTask.
export async function assignSubTask(taskId, subTaskId, assigneeId) {
  const { rows } = await pool.query(
    `UPDATE sub_tasks
        SET assignee_id = $1
      WHERE id = $2 AND task_id = $3
      RETURNING ${SUB_TASK_COLUMNS}`,
    [assigneeId, subTaskId, taskId]
  );
  return rows[0] ?? null;
}
