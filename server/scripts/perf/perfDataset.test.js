import { describe, it, expect } from 'vitest';
import { buildDataset, expectedCounts } from './perfDataset.js';

describe('buildDataset', () => {
  it('produces the agreed classroom-scale shape', () => {
    expect(expectedCounts()).toEqual({
      users: 15,
      teams: 3,
      team_members: 12,
      projects: 8,
      project_members: 31,
      sprints: 32,
      product_backlog_items: 320,
      tasks: 1280,
      sub_tasks: 2560,
      pbi_collaborators: 168,
      password_reset_tokens: 0
    });
  });

  it('is deterministic - two builds are identical', () => {
    expect(buildDataset()).toEqual(buildDataset());
  });

  it('gives every project one responsible Admin, 3-5 Developer members and 2/1/1 completed/active/planning sprints', () => {
    const data = buildDataset();
    const adminIds = new Set(data.users.filter((u) => u.role === 'admin').map((u) => u.id));
    const developerIds = new Set(data.users.filter((u) => u.role === 'developer').map((u) => u.id));

    for (const project of data.projects) {
      expect(adminIds.has(project.responsible_admin_id)).toBe(true);
      const members = data.projectMembers.filter((m) => m.project_id === project.id);
      expect(members.length).toBeGreaterThanOrEqual(3);
      expect(members.length).toBeLessThanOrEqual(5);
      members.forEach((m) => expect(developerIds.has(m.user_id)).toBe(true));
      const statuses = data.sprints.filter((s) => s.project_id === project.id).map((s) => s.status);
      expect(statuses).toEqual(['completed', 'completed', 'active', 'planning']);
    }
  });

  it('keeps stage, sprint and completion data consistent with what the product writes', () => {
    const data = buildDataset();
    const sprintById = new Map(data.sprints.map((s) => [s.id, s]));

    for (const pbi of data.pbis) {
      const sprint = pbi.sprint_id ? sprintById.get(pbi.sprint_id) : null;
      if (sprint) expect(sprint.project_id).toBe(pbi.project_id);
      if (pbi.stage === 'completed') {
        expect(sprint.status).toBe('completed');
        expect(pbi.completed_at).not.toBeNull();
        expect(pbi.actual_hours).toBeGreaterThan(0);
      } else if (pbi.stage === 'active_sprint') {
        expect(sprint.status).toBe('active');
        expect(pbi.completed_at).toBeNull();
      } else {
        expect(pbi.sprint_id).toBeNull();
        expect(pbi.completed_at).toBeNull();
      }
    }

    // Done tasks carry effort; others do not. Every task has an assignee.
    for (const task of data.tasks) {
      expect(task.assignee_id).not.toBeNull();
      expect(task.status === 'done').toBe(task.actual_hours !== null && task.completed_at !== null);
    }
  });

  it('only records collaborators who are members of the PBI project', () => {
    const data = buildDataset();
    const projectOfPbi = new Map(data.pbis.map((p) => [p.id, p.project_id]));
    const memberKeys = new Set(data.projectMembers.map((m) => `${m.project_id}:${m.user_id}`));
    for (const c of data.collaborators) {
      expect(memberKeys.has(`${projectOfPbi.get(c.pbi_id)}:${c.user_id}`)).toBe(true);
    }
  });
});
