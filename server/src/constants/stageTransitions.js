import { isBoardStage } from './boardStages.js';

// The only stage-to-stage moves a PBI is ever allowed to make (US-06).
// Nothing else is legal: no skipping a stage, no moving backward, and no
// "moving" to the stage a PBI is already sitting on.
//
//   product_backlog -> sprint_planning   selecting a PBI for the next sprint (US-08a)
//   sprint_planning -> active_sprint     starting the sprint, moves every PBI
//                                        currently in Sprint Planning together (US-10)
//   active_sprint   -> completed         finishing the work
//
// This map only answers "is this move allowed at all". It does not know or
// care which HTTP endpoint is asking, that is each controller's job. For
// example sprint_planning -> active_sprint is only ever meant to happen
// through the Start Sprint action (in bulk, with its own "cannot start an
// empty sprint" rule), not through a plain "move this one PBI" request. That
// restriction belongs to whichever endpoint uses this map, not to the map.
const ALLOWED_TRANSITIONS = Object.freeze({
  product_backlog: Object.freeze(['sprint_planning']),
  sprint_planning: Object.freeze(['active_sprint']),
  active_sprint: Object.freeze(['completed']),
  completed: Object.freeze([])
});

// The single shared guard every move operation should call before changing a
// PBI's stage (moving a single PBI, starting a sprint, and anything added
// later). It returns a result object instead of throwing:
//   { allowed: true }
//   { allowed: false, reason: "..." }
// so a controller can turn a rejection straight into a 400 response with a
// clear message, the same way it already handles other validation failures,
// rather than that rejection looking like an unexpected server error.
export function checkStageTransition(fromStage, toStage) {
  if (!isBoardStage(fromStage)) {
    return { allowed: false, reason: `Unknown current stage: "${fromStage}"` };
  }

  if (!isBoardStage(toStage)) {
    return { allowed: false, reason: `Unknown target stage: "${toStage}"` };
  }

  if (!ALLOWED_TRANSITIONS[fromStage].includes(toStage)) {
    return {
      allowed: false,
      reason: `Cannot move a PBI from "${fromStage}" to "${toStage}"`
    };
  }

  return { allowed: true };
}
