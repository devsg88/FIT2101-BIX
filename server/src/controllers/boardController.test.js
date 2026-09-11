import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBoardController } from './boardController.js';
import { getBoard } from '../models/boardModel.js';

vi.mock('../models/boardModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('getBoardController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const req = { params: { projectId: 'abc' } };
    const res = mockRes();

    await getBoardController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getBoard.mockResolvedValue(null);
    const req = { params: { projectId: '999' } };
    const res = mockRes();

    await getBoardController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  it('returns the board with the four fixed stages', async () => {
    getBoard.mockResolvedValue({
      project: { id: 1, name: 'BIX Platform' },
      sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
      pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
    });
    const req = { params: { projectId: '1' } };
    const res = mockRes();

    await getBoardController(req, res);

    expect(getBoard).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({
      project: { id: 1, name: 'BIX Platform' },
      stages: [
        'product_backlog',
        'sprint_planning',
        'active_sprint',
        'completed'
      ],
      sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
      pbis: [
        { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }
      ]
    });
  });

  it('returns 500 without leaking the error when the model throws', async () => {
    getBoard.mockRejectedValue(new Error('relation "x" does not exist'));
    const req = { params: { projectId: '1' } };
    const res = mockRes();

    await getBoardController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to load the project board'
    });
  });
});
