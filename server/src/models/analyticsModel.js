import { pool } from '../config/db.js';
import { getSprintsByProject } from './sprintModel.js';
import { buildSprintAnalytics } from '../utils/analytics.js';

export async function getRecordedEffortByProject(projectId) {
  const { rows } = await pool.query(
    `WITH effort_records AS (
       SELECT p.sprint_id, u.id AS developer_id, u.name AS developer_name,
              t.actual_hours
         FROM tasks t
         JOIN product_backlog_items p ON p.id = t.pbi_id
         LEFT JOIN users u ON u.id = t.assignee_id AND u.role = 'developer'
        WHERE p.project_id = $1 AND t.status = 'done'
          AND p.stage IN ('active_sprint', 'completed')
       UNION ALL
       SELECT p.sprint_id, NULL AS developer_id, NULL AS developer_name,
              p.actual_hours
         FROM product_backlog_items p
        WHERE p.project_id = $1 AND p.stage = 'completed'
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.pbi_id = p.id)
     )
     SELECT sprint_id, developer_id, developer_name,
            COALESCE(SUM(actual_hours) FILTER (WHERE actual_hours > 0), 0) AS actual_hours,
            COUNT(*) FILTER (WHERE actual_hours > 0) AS recorded_items,
            COUNT(*) FILTER (WHERE actual_hours IS NULL OR actual_hours <= 0) AS missing_actual_hours
       FROM effort_records
      GROUP BY sprint_id, developer_id, developer_name
      ORDER BY sprint_id, developer_name, developer_id`,
    [projectId]
  );
  return rows;
}

export async function getSprintAnalytics(projectId) {
  const [sprints, totals] = await Promise.all([
    getSprintsByProject(projectId),
    getRecordedEffortByProject(projectId)
  ]);
  return buildSprintAnalytics(sprints, totals);
}
