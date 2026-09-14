import { listProjectsForUser } from '../models/projectMembershipModel.js';
import { listTeams } from '../models/teamModel.js';

// Real data only where the schema actually supports it right now. See
// server/db/README.md ("Open questions and flags", #8) for what is
// intentionally left out below and why: the admin Team Health table
// (current project, sprint progress, status, product owner per team) and
// the developer "My Tasks" / task-level progress both depend on
// relationships that do not exist in the schema yet (a team<->project link,
// and per-user task assignment respectively). Faking either would produce
// numbers that look real but are not, so they are left out entirely rather
// than guessed. Deferred to a later sprint, not required by the current
// three journeys.
export async function getDashboardController(req, res) {
  const { role, id: userId } = req.user;

  try {
    if (role === 'admin') {
      const teams = await listTeams();
      return res.json({
        role,
        data: {
          teamCount: teams.length
          // Team Health table (per-team current project, sprint progress,
          // status, product owner) intentionally omitted - see README #8.
        }
      });
    }

    const projects = await listProjectsForUser(userId);
    return res.json({
      role,
      data: {
        projectCount: projects.length,
        projects
        // Task count / task-level progress intentionally omitted - no
        // per-user task assignment column exists yet (see README's
        // "Pending integration with login / users" section).
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load dashboard data' });
  }
}
