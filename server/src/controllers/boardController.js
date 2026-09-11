import { getBoard } from '../models/boardModel.js';
import { BOARD_STAGES, isBoardStage } from '../constants/boardStages.js';

// Re-exported so anything that already imports BOARD_STAGES from this file
// keeps working. The stage list itself now lives in one place:
// ../constants/boardStages.js.
export { BOARD_STAGES };

// Sorts a flat list of PBIs into the four board columns, in the fixed
// BOARD_STAGES order. Every stage is always included in the result, even
// when it has no PBIs, so a brand new (empty) project still gets a board
// with all four columns, and every project's board has the same shape.
//
// Each PBI is placed under exactly one stage entry, never zero, never more
// than one. A PBI's `stage` column is enforced by a database CHECK constraint
// (see server/db/schema.sql) so it should always be one of the four known
// values, but if a row ever turned up with something else, we do not want it
// to silently vanish from the board. We fail loudly instead, the controller
// turns that into a 500 rather than serving a board that is missing an item.
//
// PBI objects are spread through untouched, so whatever the caller passed in
// (title, description, dates, nested tasks/sub-tasks, etc.) comes out the
// other side exactly as it went in. This function only sorts PBIs into
// groups, it never edits or replaces a PBI, so a PBI's id and every other
// field stay exactly what they were.
export function groupPbisByStage(pbis) {
  const grouped = BOARD_STAGES.map((stage) => ({ stage, pbis: [] }));
  const bucketByStage = Object.fromEntries(
    grouped.map((entry) => [entry.stage, entry.pbis])
  );

  for (const pbi of pbis) {
    if (!isBoardStage(pbi.stage)) {
      throw new Error(`PBI ${pbi.id} has an unrecognised stage: ${pbi.stage}`);
    }
    bucketByStage[pbi.stage].push(pbi);
  }

  return grouped;
}

// GET /api/projects/:projectId/board
export async function getBoardController(req, res) {
  // Route params always arrive as strings, so we convert and check it is a
  // real, positive whole number before doing anything else.
  const projectId = Number(req.params.projectId);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }

  try {
    const board = await getBoard(projectId);

    if (!board) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.json({
      project: board.project,
      stages: groupPbisByStage(board.pbis),
      sprints: board.sprints,
      pbis: board.pbis
    });
  } catch (err) {
    // Do not send the raw database error to the client, just a plain message.
    return res.status(500).json({ message: 'Failed to load the project board' });
  }
}
