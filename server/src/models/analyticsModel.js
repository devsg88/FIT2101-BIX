import { pool } from '../config/db.js';
import { getSprintsByProject } from './sprintModel.js';
import { listProjectsForResponsibleAdmin } from './projectModel.js';
import { buildSprintAnalytics, buildProjectAnalytics } from '../utils/analytics.js';

// Scope and dimension are internal SQL fragments, never request parameters.
async function queryRecordedEffort(scope, dimension, value) {
  const { rows } = await pool.query(
    `WITH effort_records AS (
       SELECT p.project_id, p.sprint_id, u.id AS developer_id, u.name AS developer_name,
              t.actual_hours
         FROM tasks t
         JOIN product_backlog_items p ON p.id = t.pbi_id
         LEFT JOIN users u ON u.id = t.assignee_id AND u.role = 'developer'
        WHERE ${scope} AND t.status = 'done'
          AND p.stage IN ('active_sprint', 'completed')
       UNION ALL
       SELECT p.project_id, p.sprint_id, NULL AS developer_id, NULL AS developer_name,
              p.actual_hours
         FROM product_backlog_items p
        WHERE ${scope} AND p.stage = 'completed'
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.pbi_id = p.id)
     )
     SELECT ${dimension}, developer_id, developer_name,
            COALESCE(SUM(actual_hours) FILTER (WHERE actual_hours > 0), 0) AS actual_hours,
            COUNT(*) FILTER (WHERE actual_hours > 0) AS recorded_items,
            COUNT(*) FILTER (WHERE actual_hours IS NULL OR actual_hours <= 0) AS missing_actual_hours
       FROM effort_records
      GROUP BY ${dimension}, developer_id, developer_name
      ORDER BY ${dimension}, developer_name, developer_id`,
    [value]
  );
  return rows;
}

export function getRecordedEffortByProject(projectId) {
  return queryRecordedEffort('p.project_id = $1', 'sprint_id', projectId);
}

export async function getSprintAnalytics(projectId) {
  const [sprints, totals] = await Promise.all([
    getSprintsByProject(projectId),
    getRecordedEffortByProject(projectId)
  ]);
  return buildSprintAnalytics(sprints, totals);
}

export async function getProjectAnalytics(adminId) {
  const [projects, totals] = await Promise.all([
    listProjectsForResponsibleAdmin(adminId),
    queryRecordedEffort(
      `EXISTS (SELECT 1 FROM projects pr
                WHERE pr.id = p.project_id AND pr.responsible_admin_id = $1)`,
      'project_id', adminId
    )
  ]);
  return buildProjectAnalytics(projects, totals);
}
