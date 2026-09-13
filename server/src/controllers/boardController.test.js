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

  it('places every PBI in exactly one stage, none missing and none duplicated', () => {
    const pbis = [
      { id: 1, stage: 'product_backlog' },
      { id: 2, stage: 'sprint_planning' },
      { id: 3, stage: 'active_sprint' },
      { id: 4, stage: 'completed' },
      { id: 5, stage: 'completed' }
    ];

    const result = groupPbisByStage(pbis);
    const allPbisInResult = result.flatMap((entry) => entry.pbis);

    // Same PBIs, same count, nobody appears twice and nobody is missing.
    expect(allPbisInResult).toHaveLength(pbis.length);
    expect(allPbisInResult.map((p) => p.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps a PBI\'s nested tasks and sub-tasks intact when sorting it into a stage', () => {
    const pbiWithChildren = {
      id: 2,
      stage: 'sprint_planning',
      title: 'User can upload a profile photo',
      tasks: [
        {
          id: 1,
          title: 'Build the upload API endpoint',
          subTasks: [{ id: 1, title: 'Validate file size and type' }]
        }
      ]
    };

    const result = groupPbisByStage([pbiWithChildren]);
    const planningEntry = result.find((e) => e.stage === 'sprint_planning');

    expect(planningEntry.pbis).toEqual([pbiWithChildren]);
    expect(planningEntry.pbis[0].tasks[0].subTasks[0].title).toBe(
      'Validate file size and type'
    );
  });

  it('throws instead of silently dropping a PBI with an unrecognised stage', () => {
    const pbis = [{ id: 9, stage: 'archived' }];

    expect(() => groupPbisByStage(pbis)).toThrow(/unrecognised stage/);
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

  it('returns 500 without leaking details when a PBI has an unrecognised stage', async () => {
    getBoard.mockResolvedValue({
      project: { id: 1, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 1, title: 'Broken row', stage: 'archived', tasks: [] }]
    });
    const req = { params: { projectId: '1' } };
    const res = mockRes();

    await getBoardController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to load the project board'
    });
  });

  it('keeps a PBI\'s nested tasks and sub-tasks in the response, under its stage', async () => {
    getBoard.mockResolvedValue({
      project: { id: 1, name: 'BIX Platform' },
      sprints: [],
      pbis: [
        {
          id: 2,
          title: 'User can upload a profile photo',
          stage: 'sprint_planning',
          tasks: [
            {
              id: 1,
              pbi_id: 2,
              title: 'Build the upload API endpoint',
              status: 'todo',
              subTasks: [
                { id: 1, task_id: 1, title: 'Validate file size and type', status: 'todo' }
              ]
            }
          ]
        }
      ]
    });
    const req = { params: { projectId: '1' } };
    const res = mockRes();

    await getBoardController(req, res);

    const [body] = res.json.mock.calls[0];
    const planningEntry = body.stages.find((s) => s.stage === 'sprint_planning');

    expect(planningEntry.pbis[0].tasks[0].subTasks[0].title).toBe(
      'Validate file size and type'
    );
  });

  it('keeps a PBI\'s id unchanged across two loads where only its stage differs', async () => {
    // Simulates what should be true once moving a PBI is implemented: the
    // database UPDATEs the stage column on the existing row, it never
    // deletes and re-inserts the PBI. The read path here must reflect that
    // faithfully, the same id must come back before and after a move.
    getBoard.mockResolvedValue({
      project: { id: 1, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 7, title: 'User can reset password', stage: 'product_backlog', tasks: [] }]
    });
    const beforeMove = mockRes();
    await getBoardController({ params: { projectId: '1' } }, beforeMove);
    const idBefore = beforeMove.json.mock.calls[0][0].pbis[0].id;

    getBoard.mockResolvedValue({
      project: { id: 1, name: 'BIX Platform' },
      sprints: [],
      pbis: [{ id: 7, title: 'User can reset password', stage: 'sprint_planning', tasks: [] }]
    });
    const afterMove = mockRes();
    await getBoardController({ params: { projectId: '1' } }, afterMove);
    const idAfter = afterMove.json.mock.calls[0][0].pbis[0].id;

    expect(idAfter).toBe(idBefore);
  });
});
