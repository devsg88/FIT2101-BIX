import { getProjectSummariesForUser } from '../models/projectMembershipModel.js';
import { getTasksAssignedToUser } from '../models/pbiModel.js';
import { listTeams } from '../models/teamModel.js';

// Real data only where the schema actually supports it right now. See
// server/db/README.md ("Open questions and flags", #8) for what is
// intentionally left out below and why: project, sprint progress, status and
// product owner per team depend on a team<->project link that does not exist
// in the schema yet. The admin dashboard can still show the real teams
// returned by listTeams without inventing those unsupported health fields.
//
// A completed task counts as "recent" for Task History if it finished
// within this window - matches the "last 7 days" framing the UI shows.
const TASK_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function getDashboardController(req, res) {
  const { role, id: userId } = req.user;

  try {
    if (role === 'admin') {
      const teams = await listTeams();
      return res.json({
        role,
        data: {
          teamCount: teams.length,
          teams
        }
      });
    }

    const [projectSummaries, assignedTasks] = await Promise.all([
      getProjectSummariesForUser(userId),
      getTasksAssignedToUser(userId)
    ]);

    const myTasksCount = assignedTasks.filter((task) => task.status !== 'done').length;

    const historyCutoff = Date.now() - TASK_HISTORY_WINDOW_MS;
    const taskHistory = assignedTasks
      .filter(
        (task) =>
          task.status === 'done' &&
          task.completed_at &&
          new Date(task.completed_at).getTime() >= historyCutoff
      )
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
      .map((task) => ({
        id: task.id,
        title: task.title,
        projectName: task.project_name,
        completedAt: task.completed_at
      }));

    // Progress = tasks done vs total, same definition per project and
    // overall (the latter is every project's counts summed together, not a
    // separate "active sprint only" figure - there is no reliable way yet
    // to say which sprint a developer should be measured against when they
    // belong to more than one project).
    const totalDone = projectSummaries.reduce((sum, p) => sum + p.done_count, 0);
    const totalTasks = projectSummaries.reduce((sum, p) => sum + p.total_count, 0);
    const overallProgressPercent =
      totalTasks === 0 ? null : Math.round((totalDone / totalTasks) * 100);

    return res.json({
      role,
      data: {
        projectCount: projectSummaries.length,
        projects: projectSummaries.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          progress: p.total_count === 0 ? null : Math.round((p.done_count / p.total_count) * 100)
        })),
        myTasksCount,
        overallProgressPercent,
        taskHistory
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load dashboard data' });
  }
}
