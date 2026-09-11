import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBoardController,
  groupPbisByStage,
  BOARD_STAGES
} from './boardController.js';
import { getBoard } from '../models/boardModel.js';

// Replace the real database-backed model with a fake one we control per test.
vi.mock('../models/boardModel.js');

// A small fake Express response object we can inspect after calling the controller.
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('groupPbisByStage', () => {
  it('always returns all four stages, in the fixed order, even with no PBIs', () => {
    const result = groupPbisByStage([]);

    expect(result.map((entry) => entry.stage)).toEqual(BOARD_STAGES);
    expect(result.every((entry) => entry.pbis.length === 0)).toBe(true);
  });

  it('puts each PBI under the entry matching its stage', () => {
    const pbis = [
      { id: 1, stage: 'product_backlog' },
      { id: 2, stage: 'sprint_planning' },
      { id: 3, stage: 'sprint_planning' },
      { id: 4, stage: 'completed' }
    ];

    const result = groupPbisByStage(pbis);
    const byStage = Object.fromEntries(result.map((e) => [e.stage, e.pbis]));

    expect(byStage.product_backlog).toEqual([{ id: 1, stage: 'product_backlog' }]);
    expect(byStage.sprint_planning).toEqual([
      { id: 2, stage: 'sprint_planning' },
      { id: 3, stage: 'sprint_planning' }
    ]);
    expect(byStage.active_sprint).toEqual([]);
    expect(byStage.completed).toEqual([{ id: 4, stage: 'completed' }]);
  });
});

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

  it('returns the board with PBIs grouped under their stage, in fixed order', async () => {
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
        {
          stage: 'product_backlog',
          pbis: [{ id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }]
        },
        { stage: 'sprint_planning', pbis: [] },
        { stage: 'active_sprint', pbis: [] },
        { stage: 'completed', pbis: [] }
      ],
      sprints: [{ id: 3, name: 'Sprint 3', status: 'planning' }],
      pbis: [
        { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] }
      ]
    });
  });

  it('still returns all four stages for a brand new project with no PBIs', async () => {
    getBoard.mockResolvedValue({
      project: { id: 2, name: 'New Project' },
      sprints: [],
      pbis: []
    });
    const req = { params: { projectId: '2' } };
    const res = mockRes();

    await getBoardController(req, res);

    const [body] = res.json.mock.calls[0];
    expect(body.stages).toHaveLength(4);
    expect(body.stages.map((s) => s.stage)).toEqual(BOARD_STAGES);
    expect(body.stages.every((s) => Array.isArray(s.pbis) && s.pbis.length === 0)).toBe(true);
  });

  it('returns the same stage list and order for every project', async () => {
    getBoard.mockResolvedValue({ project: { id: 1, name: 'A' }, sprints: [], pbis: [] });
    const resA = mockRes();
    await getBoardController({ params: { projectId: '1' } }, resA);

    getBoard.mockResolvedValue({ project: { id: 2, name: 'B' }, sprints: [], pbis: [] });
    const resB = mockRes();
    await getBoardController({ params: { projectId: '2' } }, resB);

    const stagesA = resA.json.mock.calls[0][0].stages.map((s) => s.stage);
    const stagesB = resB.json.mock.calls[0][0].stages.map((s) => s.stage);
    expect(stagesA).toEqual(stagesB);
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
