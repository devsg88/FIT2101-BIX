import { getBoard } from '../models/boardModel.js';

// The four workflow stages, in the fixed order required by US-06. This is the
// single source of truth on the backend; the frontend keeps a matching list.
export const BOARD_STAGES = [
  'product_backlog',
  'sprint_planning',
  'active_sprint',
  'completed'
];

// GET /api/projects/:projectId/board
export async function getBoardController(req, res) {
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
      stages: BOARD_STAGES,
      sprints: board.sprints,
      pbis: board.pbis
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load the project board' });
  }
}
