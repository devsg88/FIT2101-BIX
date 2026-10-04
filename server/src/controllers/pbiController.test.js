import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPbiController,
  deletePbiController,
  listPbisController,
  moveStageController,
  updatePbiDetailsController,
  updatePlanningController
} from './pbiController.js';
import {
  createPbi,
  deletePbi,
  getPbiById,
  getPbisByProject,
  updatePbiDetails,
  updatePbiPlanning,
  updatePbiStage
} from '../models/pbiModel.js';

// Replace the real database-backed model with a fake one we control per test.
// checkStageTransition is NOT mocked, the real workflow rules from
// ../constants/stageTransitions.js run in these tests too.
vi.mock('../models/pbiModel.js');

// A small fake Express response object we can inspect after calling the controller.
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', pbiId = '2', stage = 'sprint_planning' } = {}) {
  return { params: { projectId, pbiId }, body: { stage } };
}

describe('moveStageController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await moveStageController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when pbiId is not a positive integer', async () => {
    const res = mockRes();

    await moveStageController(mockReq({ pbiId: '0' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when no target stage is given', async () => {
    const res = mockRes();

    // Built by hand rather than mockReq(), whose `stage` default would kick
    // in for an explicit `undefined` and defeat the point of this test.
    await moveStageController({ params: { projectId: '1', pbiId: '2' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A target stage is required' });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await moveStageController(mockReq(), res);

    expect(getPbiById).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects moving a single PBI into Active Sprint, which is a Start Sprint action', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'active_sprint' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot move a PBI into Active Sprint individually. Start the sprint instead.'
    });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects a move the workflow does not allow, and never writes to the database', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    // product_backlog -> completed is both an illegal skip and a move that
    // US-11 requires to go through the complete-PBI action.
    await moveStageController(mockReq({ stage: 'completed' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot move a PBI into Completed without recording actual hours. Complete the PBI instead.'
    });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised target stage', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'in_review' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('moves a PBI from Product Backlog to Sprint Planning and returns it', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const updatedPbi = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      stage: 'sprint_planning'
    };
    updatePbiStage.mockResolvedValue(updatedPbi);
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'sprint_planning' }), res);

    expect(updatePbiStage).toHaveBeenCalledWith(1, 2, 'sprint_planning');
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ pbi: updatedPbi });
  });

  it('returns 404 if the PBI disappears between the check and the update', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    updatePbiStage.mockResolvedValue(null);
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'sprint_planning' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await moveStageController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to move the PBI' });
  });
});

function planningReq({
  projectId = '1',
  pbiId = '2',
  body = {
    planned_start_date: '2026-09-15',
    planned_end_date: '2026-09-22',
    estimated_hours: 16
  }
} = {}) {
  return { params: { projectId, pbiId }, body };
}

describe('updatePlanningController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when the end date is before the start date', async () => {
    const res = mockRes();

    await updatePlanningController(
      planningReq({
        body: {
          planned_start_date: '2026-09-22',
          planned_end_date: '2026-09-15',
          estimated_hours: 16
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 400 when estimated hours are not greater than 0', async () => {
    const res = mockRes();

    await updatePlanningController(
      planningReq({
        body: {
          planned_start_date: '2026-09-15',
          planned_end_date: '2026-09-22',
          estimated_hours: 0
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 400 when the PBI is not in Sprint Planning', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Planning details can only be set while a PBI is in Sprint Planning'
    });
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('saves dates and estimated hours without changing stage', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    const updatedPbi = {
      id: 2,
      project_id: 1,
      stage: 'sprint_planning',
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: '16.00'
    };
    updatePbiPlanning.mockResolvedValue(updatedPbi);
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(updatePbiPlanning).toHaveBeenCalledWith(1, 2, {
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: 16
    });
    expect(res.json).toHaveBeenCalledWith({ pbi: updatedPbi });
  });
});

describe('listPbisController (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await listPbisController({ params: { projectId: 'abc' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A valid projectId is required' });
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it("returns that project's PBIs, looked up by the numeric projectId", async () => {
    const pbis = [
      { id: 1, project_id: 1, title: 'User can reset password', stage: 'product_backlog' },
      { id: 2, project_id: 1, title: 'User can upload a profile photo', stage: 'sprint_planning' }
    ];
    getPbisByProject.mockResolvedValue(pbis);
    const res = mockRes();

    await listPbisController({ params: { projectId: '1' } }, res);

    expect(getPbisByProject).toHaveBeenCalledWith(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ pbis });
  });

  it('returns an empty list for a project with no PBIs', async () => {
    getPbisByProject.mockResolvedValue([]);
    const res = mockRes();

    await listPbisController({ params: { projectId: '7' } }, res);

    expect(res.json).toHaveBeenCalledWith({ pbis: [] });
  });

  it('returns 500 without leaking details when the database throws', async () => {
    getPbisByProject.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await listPbisController({ params: { projectId: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to load the Product Backlog Items'
    });
  });
});

describe('createPbiController (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createReq(body, projectId = '1') {
    return { params: { projectId }, body };
  }

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await createPbiController(createReq({ title: 'T' }, '-1'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A valid projectId is required' });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['null', { title: null }],
    ['blank', { title: '   ' }]
  ])('returns 400 when the title is %s', async (_label, body) => {
    const res = mockRes();

    await createPbiController(createReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A PBI title is required' });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is not text', async () => {
    const res = mockRes();

    await createPbiController(createReq({ title: 42 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'The PBI title must be text' });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 400 when the description is not text', async () => {
    const res = mockRes();

    await createPbiController(createReq({ title: 'T', description: { x: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'The PBI description must be text' });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is missing entirely', async () => {
    const res = mockRes();

    await createPbiController({ params: { projectId: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('creates the PBI in the route project with a trimmed title and description, and returns 201', async () => {
    const created = { id: 7, project_id: 1, title: 'New item', description: 'Details', stage: 'product_backlog' };
    createPbi.mockResolvedValue(created);
    const res = mockRes();

    await createPbiController(createReq({ title: '  New item  ', description: '  Details ' }), res);

    expect(createPbi).toHaveBeenCalledWith(1, { title: 'New item', description: 'Details' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ pbi: created });
  });

  it('stores a missing or blank description as null', async () => {
    createPbi.mockResolvedValue({ id: 8 });

    await createPbiController(createReq({ title: 'A' }), mockRes());
    await createPbiController(createReq({ title: 'B', description: '   ' }), mockRes());

    expect(createPbi).toHaveBeenNthCalledWith(1, 1, { title: 'A', description: null });
    expect(createPbi).toHaveBeenNthCalledWith(2, 1, { title: 'B', description: null });
  });

  it('ignores project_id, stage, sprint_id and hours in the body', async () => {
    createPbi.mockResolvedValue({ id: 9 });

    await createPbiController(
      createReq({
        title: 'T',
        project_id: 2,
        projectId: 2,
        stage: 'active_sprint',
        sprint_id: 4,
        estimated_hours: 10
      }),
      mockRes()
    );

    expect(createPbi).toHaveBeenCalledWith(1, { title: 'T', description: null });
  });

  it('returns 500 without leaking details when the database throws', async () => {
    createPbi.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await createPbiController(createReq({ title: 'T' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to create the PBI' });
  });
});

describe('updatePbiDetailsController (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function editReq(body, { projectId = '1', pbiId = '2' } = {}) {
    return { params: { projectId, pbiId }, body };
  }

  it('returns 400 when projectId or pbiId is not a positive integer', async () => {
    const res1 = mockRes();
    const res2 = mockRes();

    await updatePbiDetailsController(editReq({ title: 'T' }, { projectId: 'x' }), res1);
    await updatePbiDetailsController(editReq({ title: 'T' }, { pbiId: '0' }), res2);

    expect(res1.json).toHaveBeenCalledWith({ message: 'A valid projectId is required' });
    expect(res2.json).toHaveBeenCalledWith({ message: 'A valid pbiId is required' });
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it('returns 400 when no editable field is provided', async () => {
    const res = mockRes();

    await updatePbiDetailsController(editReq({ stage: 'completed' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Provide a title or description to update' });
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: '   ' }, 'The PBI title cannot be blank'],
    [{ title: null }, 'The PBI title must be text'],
    [{ title: 5 }, 'The PBI title must be text'],
    [{ description: 5 }, 'The PBI description must be text']
  ])('returns 400 for %j', async (body, message) => {
    const res = mockRes();

    await updatePbiDetailsController(editReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message });
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it('updates only the fields sent, trimmed, and returns the PBI', async () => {
    const updated = { id: 2, project_id: 1, title: 'New title' };
    updatePbiDetails.mockResolvedValue(updated);
    const res = mockRes();

    await updatePbiDetailsController(editReq({ title: '  New title ' }), res);

    expect(updatePbiDetails).toHaveBeenCalledWith(1, 2, { title: 'New title' });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ pbi: updated });
  });

  it('clears the description when it is sent as null or blank', async () => {
    updatePbiDetails.mockResolvedValue({ id: 2 });

    await updatePbiDetailsController(editReq({ description: null }), mockRes());
    await updatePbiDetailsController(editReq({ description: '  ' }), mockRes());

    expect(updatePbiDetails).toHaveBeenNthCalledWith(1, 1, 2, { description: null });
    expect(updatePbiDetails).toHaveBeenNthCalledWith(2, 1, 2, { description: null });
  });

  it('ignores stage, sprint, hours and project fields in the body', async () => {
    updatePbiDetails.mockResolvedValue({ id: 2 });

    await updatePbiDetailsController(
      editReq({
        title: 'T',
        description: 'D',
        stage: 'completed',
        sprint_id: 4,
        estimated_hours: 3,
        project_id: 2
      }),
      mockRes()
    );

    expect(updatePbiDetails).toHaveBeenCalledWith(1, 2, { title: 'T', description: 'D' });
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    updatePbiDetails.mockResolvedValue(null);
    const res = mockRes();

    await updatePbiDetailsController(editReq({ title: 'T' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 500 without leaking details when the database throws', async () => {
    updatePbiDetails.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await updatePbiDetailsController(editReq({ title: 'T' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update the PBI' });
  });
});

describe('deletePbiController (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function deleteReq({ projectId = '1', pbiId = '2' } = {}) {
    return { params: { projectId, pbiId } };
  }

  it('returns 400 when projectId or pbiId is not a positive integer', async () => {
    const res1 = mockRes();
    const res2 = mockRes();

    await deletePbiController(deleteReq({ projectId: 'x' }), res1);
    await deletePbiController(deleteReq({ pbiId: '1.5' }), res2);

    expect(res1.json).toHaveBeenCalledWith({ message: 'A valid projectId is required' });
    expect(res2.json).toHaveBeenCalledWith({ message: 'A valid pbiId is required' });
    expect(getPbiById).not.toHaveBeenCalled();
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await deletePbiController(deleteReq(), res);

    expect(getPbiById).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('returns 400 and deletes nothing when the PBI is in the Active Sprint', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'active_sprint' });
    const res = mockRes();

    await deletePbiController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete a PBI that is in the Active Sprint'
    });
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it.each(['product_backlog', 'sprint_planning', 'completed'])(
    'deletes a PBI in %s and returns it',
    async (stage) => {
      const pbi = { id: 2, project_id: 1, stage };
      getPbiById.mockResolvedValue(pbi);
      deletePbi.mockResolvedValue(pbi);
      const res = mockRes();

      await deletePbiController(deleteReq(), res);

      expect(deletePbi).toHaveBeenCalledWith(1, 2);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ pbi });
    }
  );

  // 23001 is what PostgreSQL actually raises for tasks.pbi_id ON DELETE
  // RESTRICT (found in the SCRUM-104 walkthrough against a real database);
  // 23503 is the NO ACTION equivalent.
  it.each([
    ['restrict_violation (23001)', '23001'],
    ['foreign_key_violation (23503)', '23503']
  ])('returns 409 when the PBI still has tasks - %s', async (_label, code) => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    deletePbi.mockRejectedValue(
      Object.assign(
        new Error(
          'update or delete on table "product_backlog_items" violates RESTRICT setting of foreign key constraint "tasks_pbi_id_fkey" on table "tasks"'
        ),
        { code }
      )
    );
    const res = mockRes();

    await deletePbiController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete a PBI that still has tasks. Remove its tasks first.'
    });
  });

  it('returns 409 if the PBI changed between the check and the delete', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    deletePbi.mockResolvedValue(null);
    const res = mockRes();

    await deletePbiController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await deletePbiController(deleteReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to delete the PBI' });
  });
});
