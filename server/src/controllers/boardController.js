import { getBoard } from '../models/boardModel.js';
import { BOARD_STAGES } from '../constants/boardStages.js';

// Re-exported so anything that already imports BOARD_STAGES from this file
// keeps working. The stage list itself now lives in one place:
// ../constants/boardStages.js.
export { BOARD_STAGES };

// Sorts a flat list of PBIs into the four board columns, in the fixed
// BOARD_STAGES order. Every stage is always included in the result, even
// when it has no PBIs, so a brand new (empty) project still gets a board
// with all four columns, and every project's board has the same shape.
export function groupPbisByStage(pbis) {
  return BOARD_STAGES.map((stage) => ({
    stage,
    pbis: pbis.filter((pbi) => pbi.stage === stage)
  }));
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
