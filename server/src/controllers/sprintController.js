import { getPbisByStage } from '../models/pbiModel.js';
import { getSprintById, startSprint } from '../models/sprintModel.js';
import { checkStageTransition } from '../constants/stageTransitions.js';

// US-10 — Yichi Zhang
//
// startSprintController starts the planned sprint: every PBI currently in
// Sprint Planning is moved into Active Sprint together, in one transaction,
// keeping planned dates / Estimated Hours / tasks / sub-tasks. An empty
// sprint is rejected. Each PBI's move is still checked with
// checkStageTransition (the same shared guard moveStageController uses).
//
// Also needs project-membership authorization (see requireProjectMembership
// in ../middleware/authMiddleware.js) before it may change data — right now
// any authenticated user can start any project's sprint, same known gap as
// the PBI mutation endpoints.

function hasPlanningDetails(pbi) {
  return (
    pbi.estimated_hours != null &&
    pbi.planned_start_date != null &&
    pbi.planned_end_date != null
  );
}

// POST /api/projects/:projectId/sprints/:sprintId/start
export async function startSprintController(req, res) {
  const projectId = Number(req.params.projectId);
  const sprintId = Number(req.params.sprintId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  if (!Number.isInteger(sprintId) || sprintId <= 0) {
    return res.status(400).json({ message: 'A valid sprintId is required' });
  }

  try {
    const sprint = await getSprintById(projectId, sprintId);
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    // A sprint that is already active or completed cannot be started again.
    if (sprint.status !== 'planning') {
      return res.status(400).json({ message: 'Only a sprint still in planning can be started' });
    }

    // All Sprint Planning PBIs in this project move together. Items still
    // sitting in Product Backlog are left where they are.
    const planningPbis = await getPbisByStage(projectId, 'sprint_planning');
    if (planningPbis.length === 0) {
      return res.status(400).json({ message: 'Cannot start an empty sprint' });
    }

    // US-08b must have run on every item first: Start Sprint does not invent
    // estimates or dates, it only changes stage (and records sprint_id).
    if (planningPbis.some((pbi) => !hasPlanningDetails(pbi))) {
      return res.status(400).json({
        message: 'Every item in Sprint Planning needs estimate and dates before the sprint can start'
      });
    }

    for (const pbi of planningPbis) {
      const transition = checkStageTransition(pbi.stage, 'active_sprint');
      if (!transition.allowed) {
        return res.status(400).json({ message: transition.reason });
      }
    }

    const started = await startSprint(projectId, sprintId);
    if (!started) {
      // Race: the sprint left "planning" between the check above and the UPDATE.
      return res.status(400).json({ message: 'Only a sprint still in planning can be started' });
    }

    return res.json(started);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to start the sprint' });
  }
}
