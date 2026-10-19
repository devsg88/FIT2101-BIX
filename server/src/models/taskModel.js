import { pool } from '../config/db.js';

const TASK_COLUMNS = `
  t.id, t.pbi_id, t.title, t.description, t.status,
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
    `SELECT id, task_id, title, description, status, assignee_id
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
      RETURNING s.id, s.task_id, s.title, s.description, s.status, s.assignee_id`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTaskById(projectId, subTaskId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.description, s.status, s.assignee_id,
            p.project_id, p.stage AS pbi_stage
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE s.id = $1 AND p.project_id = $2`,
    [subTaskId, projectId]
  );
  return rows[0] ?? null;
}

export async function getSubTasksByPbi(projectId, pbiId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.task_id, s.title, s.description, s.status, s.assignee_id
       FROM sub_tasks s
       JOIN tasks t ON t.id = s.task_id
       JOIN product_backlog_items p ON p.id = t.pbi_id
      WHERE p.project_id = $1 AND p.id = $2
      ORDER BY s.id`,
    [projectId, pbiId]
  );
  return rows;
}

// Lock the parent PBI and check its stage inside each write. This serializes
// breakdown changes with Start Sprint, which updates that same PBI row.
export async function createTask(projectId, pbiId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT id, stage FROM product_backlog_items
        WHERE project_id = $1 AND id = $2 FOR UPDATE
     )
     INSERT INTO tasks (pbi_id, title, description, status)
     SELECT id, $3, $4, 'todo' FROM parent WHERE stage = 'sprint_planning'
     RETURNING id, pbi_id, title, description, status,
               assignee_id, actual_hours, completed_at`,
    [projectId, pbiId, title, description]
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

const PBI_TASK_COLUMNS = `id, pbi_id, title, description, status, assignee_id, actual_hours, completed_at`;

export async function getTaskInPbi(pbiId, taskId) {
  const { rows } = await pool.query(
    `SELECT ${PBI_TASK_COLUMNS}
       FROM tasks
      WHERE id = $1 AND pbi_id = $2`,
    [taskId, pbiId]
  );
  return rows[0] ?? null;
}

export async function updateTask(projectId, taskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT p.id, p.stage FROM product_backlog_items p
       JOIN tasks t ON t.pbi_id = p.id
        WHERE p.project_id = $1 AND t.id = $2 FOR UPDATE OF p
     )
     UPDATE tasks t SET title = $3, description = $4
       FROM parent
      WHERE t.id = $2 AND t.pbi_id = parent.id
        AND parent.stage = 'sprint_planning'
      RETURNING ${TASK_COLUMNS}`,
    [projectId, taskId, title, description]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Writes title and status only - assignee_id is untouched here,
// that is assignTask's job (SCRUM-122), keeping "edit the task" and
// "(re)assign the task" as two separate, independently callable actions.
export async function updateTaskInPbi(pbiId, taskId, { title, status }) {
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

export async function createSubTask(projectId, taskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT t.id, p.stage FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
        WHERE p.project_id = $1 AND t.id = $2 FOR UPDATE OF p
     )
     INSERT INTO sub_tasks (task_id, title, description, status)
     SELECT id, $3, $4, 'todo' FROM parent WHERE stage = 'sprint_planning'
     RETURNING id, task_id, title, description, status, assignee_id`,
    [projectId, taskId, title, description]
  );
  return rows[0] ?? null;
}

export async function updateSubTask(projectId, subTaskId, { title, description }) {
  const { rows } = await pool.query(
    `WITH parent AS (
       SELECT t.id, p.stage FROM tasks t
       JOIN product_backlog_items p ON p.id = t.pbi_id
       JOIN sub_tasks s ON s.task_id = t.id
        WHERE p.project_id = $1 AND s.id = $2 FOR UPDATE OF p
     )
     UPDATE sub_tasks s SET title = $3, description = $4
       FROM parent
      WHERE s.id = $2 AND s.task_id = parent.id
        AND parent.stage = 'sprint_planning'
      RETURNING s.id, s.task_id, s.title, s.description, s.status, s.assignee_id`,
    [projectId, subTaskId, title, description]
  );
  return rows[0] ?? null;
}

// SCRUM-121. Deletes exactly one task row. Does NOT touch its sub-tasks:
// tasks.pbi_id and sub_tasks.task_id are both ON DELETE RESTRICT (see
// server/db/schema.sql, "Deletion behaviour"), so this DELETE fails at the
// database level while any sub-task still references this task. Callers must
// delete the task's sub-tasks first via subTaskModel.deleteSubTasksByTaskId,
// then call this - bottom-up, same order server/db/README.md already documents
// for the schema generally. deleteTaskController uses deleteTaskWithSubTasks
// below instead, which does both in one transaction.
export async function deleteTask(pbiId, taskId) {
  const { rowCount } = await pool.query(
    `DELETE FROM tasks WHERE id = $1 AND pbi_id = $2`,
    [taskId, pbiId]
  );
  return rowCount > 0;
}

// NFR-03 / SCRUM-192. Deletes a task and its sub-tasks as ONE unit, which is
// what deleteTaskController uses. The two DELETEs used to run separately: if
// the second failed (a dropped connection, or a sub-task added in between
// making the RESTRICT foreign key fire), the sub-tasks were already gone
// while the task stayed - partial data. Now either both happen or neither.
//
// The task row is locked FOR UPDATE first, so a sub-task being added to it at
// the same moment (which needs a lock on that row for its foreign key) waits
// until this finishes. Returns true if the task was deleted, false if no task
// with that id exists in that PBI (nothing is deleted then). Any failure rolls
// everything back and is rethrown for the controller to answer.
export async function deleteTaskWithSubTasks(pbiId, taskId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const task = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND pbi_id = $2 FOR UPDATE`,
      [taskId, pbiId]
    );
    if (task.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(`DELETE FROM sub_tasks WHERE task_id = $1`, [taskId]);
    await client.query(`DELETE FROM tasks WHERE id = $1 AND pbi_id = $2`, [taskId, pbiId]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
