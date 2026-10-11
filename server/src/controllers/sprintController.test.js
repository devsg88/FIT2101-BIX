import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startSprintController, updateSprintRolesController } from './sprintController.js';
import { getPbisByStage } from '../models/pbiModel.js';
import { getSprintById, startSprint, updateSprintRoles } from '../models/sprintModel.js';
import { findUserById } from '../models/userModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

vi.mock('../models/pbiModel.js');
vi.mock('../models/sprintModel.js');
vi.mock('../models/userModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/projectModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', sprintId = '3' } = {}) {
  return { params: { projectId, sprintId } };
}

const plannedPbi = {
  id: 2,
  project_id: 1,
  stage: 'sprint_planning',
  planned_start_date: '2026-09-15',
  planned_end_date: '2026-09-22',
  estimated_hours: '16.00'
};

describe('startSprintController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await startSprintController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getSprintById).not.toHaveBeenCalled();
  });

  it('returns 404 when the sprint does not exist in that project', async () => {
    getSprintById.mockResolvedValue(null);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(getSprintById).toHaveBeenCalledWith(1, 3);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when the sprint is not still in planning', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'active' });
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when there are no PBIs in Sprint Planning', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([]);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Cannot start an empty sprint' });
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when a planning PBI is still missing estimate or dates', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([
      { id: 2, stage: 'sprint_planning', estimated_hours: null, planned_start_date: null, planned_end_date: null }
    ]);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('starts the sprint and returns the updated sprint and PBIs', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([plannedPbi]);
    const started = {
      sprint: { id: 3, status: 'active' },
      pbis: [{ ...plannedPbi, stage: 'active_sprint', sprint_id: 3 }]
    };
    startSprint.mockResolvedValue(started);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(startSprint).toHaveBeenCalledWith(1, 3);
    expect(res.json).toHaveBeenCalledWith(started);
  });
});

// US-09 / SCRUM-177
describe('updateSprintRolesController', () => {
  const sprint = { id: '3', project_id: '1', name: 'Sprint 3', status: 'planning' };
  const developerUser = { id: '2', name: 'Developer', email: 'developer@bix.app', role: 'developer' };
  const adminUser = { id: '3', name: 'Admin', email: 'admin@bix.app', role: 'admin' };

  function rolesReq(body, params = {}) {
    return { params: { projectId: '1', sprintId: '3', ...params }, body };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getSprintById.mockResolvedValue(sprint);
    findUserById.mockResolvedValue(developerUser);
    isProjectMember.mockResolvedValue(true);
    updateSprintRoles.mockImplementation(async (_p, _s, changes) => ({
      ...sprint,
      scrum_master_id: changes.scrumMasterId === undefined ? null : changes.scrumMasterId,
      product_owner_identifier: changes.productOwnerIdentifier ?? null
    }));
  });

  describe('200 - saved', () => {
    it('saves a Scrum Master who is a real Developer member, plus a Product Owner', async () => {
      const res = mockRes();

      await updateSprintRolesController(
        rolesReq({ scrum_master_id: 2, product_owner_identifier: '  po@bix.app ' }),
        res
      );

      expect(findUserById).toHaveBeenCalledWith(2);
      expect(isProjectMember).toHaveBeenCalledWith(1, '2');
      expect(updateSprintRoles).toHaveBeenCalledWith(1, 3, {
        scrumMasterId: 2,
        productOwnerIdentifier: 'po@bix.app'
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        sprint: expect.objectContaining({ scrum_master_id: 2, product_owner_identifier: 'po@bix.app' })
      });
    });

    it("accepts the project's responsible Admin as Scrum Master", async () => {
      findUserById.mockResolvedValue(adminUser);
      getProjectResponsibility.mockResolvedValue({ isResponsible: true });
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 3 }), res);

      expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
      expect(isProjectMember).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('saves only the Product Owner without looking up any user', async () => {
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ product_owner_identifier: 'Jane Client' }), res);

      expect(findUserById).not.toHaveBeenCalled();
      expect(updateSprintRoles).toHaveBeenCalledWith(1, 3, { productOwnerIdentifier: 'Jane Client' });
    });

    it('clears both roles with null, without looking up any user', async () => {
      const res = mockRes();

      await updateSprintRolesController(
        rolesReq({ scrum_master_id: null, product_owner_identifier: null }),
        res
      );

      expect(findUserById).not.toHaveBeenCalled();
      expect(updateSprintRoles).toHaveBeenCalledWith(1, 3, {
        scrumMasterId: null,
        productOwnerIdentifier: null
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('treats a blank Product Owner as cleared', async () => {
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ product_owner_identifier: '   ' }), res);

      expect(updateSprintRoles).toHaveBeenCalledWith(1, 3, { productOwnerIdentifier: null });
    });
  });

  describe('400 - Scrum Master is not a real user on this project (AC4)', () => {
    it('rejects a user id that does not exist, and saves nothing', async () => {
      findUserById.mockResolvedValue(null);
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 999 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'The Scrum Master must be an existing user' });
      expect(updateSprintRoles).not.toHaveBeenCalled();
    });

    it('rejects a real Developer who is not a member of this project', async () => {
      isProjectMember.mockResolvedValue(false);
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 2 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'The Scrum Master must be a member of this project'
      });
      expect(updateSprintRoles).not.toHaveBeenCalled();
    });

    it('rejects an Admin who is not responsible for this project', async () => {
      findUserById.mockResolvedValue(adminUser);
      getProjectResponsibility.mockResolvedValue({ isResponsible: false });
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 3 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(updateSprintRoles).not.toHaveBeenCalled();
    });

    it('rejects the save if the user is deleted between the check and the update', async () => {
      updateSprintRoles.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 2 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'The Scrum Master must be an existing user' });
    });
  });

  describe('400 - bad request body or sprintId', () => {
    it.each([
      ['nothing is sent', {}],
      ['scrum_master_id is a string', { scrum_master_id: '2' }],
      ['scrum_master_id is zero', { scrum_master_id: 0 }],
      ['scrum_master_id is a decimal', { scrum_master_id: 2.5 }],
      ['scrum_master_id is a boolean', { scrum_master_id: true }],
      ['product_owner_identifier is a number', { product_owner_identifier: 42 }],
      ['product_owner_identifier is too long', { product_owner_identifier: 'x'.repeat(256) }]
    ])('returns 400 when %s, without touching the database', async (_label, body) => {
      const res = mockRes();

      await updateSprintRolesController(rolesReq(body), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(getSprintById).not.toHaveBeenCalled();
      expect(updateSprintRoles).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid sprintId', async () => {
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 2 }, { sprintId: 'abc' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(getSprintById).not.toHaveBeenCalled();
    });
  });

  describe('404 - sprint not found', () => {
    it('returns 404 for a sprint that is not in this project, before checking the user', async () => {
      getSprintById.mockResolvedValue(null);
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ scrum_master_id: 2 }), res);

      expect(getSprintById).toHaveBeenCalledWith(1, 3);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Sprint not found' });
      expect(findUserById).not.toHaveBeenCalled();
      expect(updateSprintRoles).not.toHaveBeenCalled();
    });

    it('returns 404 if the sprint disappears before the update', async () => {
      updateSprintRoles.mockResolvedValue(null);
      const res = mockRes();

      await updateSprintRolesController(rolesReq({ product_owner_identifier: 'Jane' }), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  it('returns 500 with a plain message when the database fails', async () => {
    getSprintById.mockRejectedValue(new Error('connection refused'));
    const res = mockRes();

    await updateSprintRolesController(rolesReq({ scrum_master_id: 2 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to update the sprint roles' });
  });
});
