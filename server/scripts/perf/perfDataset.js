// NFR-02 / SCRUM-196. The representative performance dataset, as plain data.
//
// buildDataset() is pure and deterministic: no randomness, no clock reads, and
// every id is assigned here, so every run produces exactly the same rows. The
// seed script (seed-perf-data.js) only writes what this returns.
//
// Shape (classroom/demo scale, see docs/performance/baseline.md):
//   3 Admins, 12 Developers, 3 teams of 4 Developers
//   8 projects, each with one responsible Admin and 3-5 Developer members
//   per project: 4 sprints (2 completed, 1 active, 1 planning) and 40 PBIs:
//     14 Completed (7 per completed sprint), 10 Active Sprint,
//      6 Sprint Planning, 10 Product Backlog
//   4 Tasks per PBI, 2 Sub-tasks per Task
//   => 320 PBIs, 1,280 Tasks, 2,560 Sub-tasks

export const SHAPE = Object.freeze({
  admins: 3,
  developers: 12,
  teams: 3,
  projects: 8,
  sprintsPerProject: 4,
  tasksPerPbi: 4,
  subTasksPerTask: 2,
  // Stage of each of a project's 40 PBIs, in order.
  pbiPlan: Object.freeze([
    ...Array(7).fill({ stage: 'completed', sprint: 0 }),
    ...Array(7).fill({ stage: 'completed', sprint: 1 }),
    ...Array(10).fill({ stage: 'active_sprint', sprint: 2 }),
    ...Array(6).fill({ stage: 'sprint_planning', sprint: null }),
    ...Array(10).fill({ stage: 'product_backlog', sprint: null })
  ])
});

// Fixed calendar for every project's sprints, so dates never depend on when
// the seed runs. The active sprint's planned end is after the baseline date,
// so its burndown has both a recorded and a still-to-come part.
const SPRINTS = Object.freeze([
  { name: 'Sprint 1', status: 'completed', startedAt: '2026-09-01T09:00:00Z', start: '2026-09-01', end: '2026-09-12' },
  { name: 'Sprint 2', status: 'completed', startedAt: '2026-09-15T09:00:00Z', start: '2026-09-15', end: '2026-09-26' },
  { name: 'Sprint 3', status: 'active', startedAt: '2026-10-06T09:00:00Z', start: '2026-10-06', end: '2026-10-24' },
  { name: 'Sprint 4', status: 'planning', startedAt: null, start: '2026-10-27', end: '2026-11-07' }
]);

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function buildDataset() {
  const users = [];
  for (let i = 1; i <= SHAPE.admins; i += 1) {
    users.push({ id: users.length + 1, name: `Perf Admin ${i}`, email: `perf.admin${i}@perf.bix.test`, role: 'admin' });
  }
  for (let i = 1; i <= SHAPE.developers; i += 1) {
    users.push({ id: users.length + 1, name: `Perf Developer ${i}`, email: `perf.dev${i}@perf.bix.test`, role: 'developer' });
  }
  const admins = users.filter((u) => u.role === 'admin');
  const developers = users.filter((u) => u.role === 'developer');

  const teams = [];
  const teamMembers = [];
  const perTeam = developers.length / SHAPE.teams;
  for (let t = 0; t < SHAPE.teams; t += 1) {
    const team = { id: t + 1, name: `Perf Team ${String.fromCharCode(65 + t)}` };
    teams.push(team);
    developers.slice(t * perTeam, (t + 1) * perTeam).forEach((dev) => {
      teamMembers.push({ team_id: team.id, user_id: dev.id });
    });
  }

  const projects = [];
  const projectMembers = [];
  const sprints = [];
  const pbis = [];
  const tasks = [];
  const subTasks = [];
  const collaborators = [];

  for (let p = 0; p < SHAPE.projects; p += 1) {
    const project = {
      id: p + 1,
      name: `Perf Project ${p + 1}`,
      responsible_admin_id: admins[p % admins.length].id
    };
    projects.push(project);

    // 3, 4 or 5 Developer members, taken in a rotating window.
    const memberCount = 3 + (p % 3);
    const members = [];
    for (let m = 0; m < memberCount; m += 1) {
      members.push(developers[(p * 3 + m) % developers.length]);
    }
    members.forEach((dev) => projectMembers.push({ project_id: project.id, user_id: dev.id }));

    const projectSprints = SPRINTS.map((s) => {
      const sprint = {
        id: sprints.length + 1,
        project_id: project.id,
        name: s.name,
        status: s.status,
        started_at: s.startedAt
      };
      sprints.push(sprint);
      return { ...s, id: sprint.id };
    });

    SHAPE.pbiPlan.forEach((plan, j) => {
      const sprint = plan.sprint === null ? null : projectSprints[plan.sprint];
      const window = sprint ?? (plan.stage === 'sprint_planning' ? projectSprints[3] : null);
      const estimate = plan.stage === 'product_backlog' ? null : 2 + ((p * 7 + j * 3) % 9);
      const isCompleted = plan.stage === 'completed';
      const completedAt = isCompleted ? `${addDays(window.start, j % 10)}T16:00:00Z` : null;

      const pbi = {
        id: pbis.length + 1,
        project_id: project.id,
        sprint_id: sprint ? sprint.id : null,
        title: `P${project.id} item ${j + 1}`,
        description: `Representative backlog item ${j + 1} of ${project.name}.`,
        stage: plan.stage,
        planned_start_date: window ? window.start : null,
        planned_end_date: window ? window.end : null,
        estimated_hours: estimate,
        actual_hours: null,
        completed_at: completedAt
      };
      pbis.push(pbi);

      let pbiActual = 0;
      for (let k = 0; k < SHAPE.tasksPerPbi; k += 1) {
        // Status variation inside the active sprint: one done, one ready to
        // complete (all its sub-tasks done), one in progress, one to do.
        let status = 'todo';
        if (isCompleted) status = 'done';
        else if (plan.stage === 'active_sprint') status = ['done', 'in_progress', 'in_progress', 'todo'][k];

        const assignee = members[(j + k) % members.length];
        const taskActual = status === 'done' ? round2(1 + (k % 3) * 0.5 + ((j + p) % 4) * 0.25) : null;
        if (taskActual) pbiActual += taskActual;
        const taskCompletedAt =
          status === 'done'
            ? completedAt ?? `${addDays(projectSprints[2].start, (j + k) % 7)}T12:00:00Z`
            : null;

        const task = {
          id: tasks.length + 1,
          pbi_id: pbi.id,
          title: `Task ${k + 1} of P${project.id} item ${j + 1}`,
          description: k % 2 === 0 ? `Work for task ${k + 1}.` : null,
          status,
          assignee_id: assignee.id,
          actual_hours: taskActual,
          completed_at: taskCompletedAt
        };
        tasks.push(task);

        for (let s = 0; s < SHAPE.subTasksPerTask; s += 1) {
          let subStatus = 'todo';
          if (status === 'done') subStatus = 'done';
          else if (plan.stage === 'active_sprint' && k === 1) subStatus = 'done';
          else if (plan.stage === 'active_sprint' && k === 2 && s === 0) subStatus = 'done';
          else if (plan.stage === 'active_sprint' && k === 2) subStatus = 'in_progress';

          subTasks.push({
            id: subTasks.length + 1,
            task_id: task.id,
            title: `Sub-task ${s + 1} of task ${task.id}`,
            description: null,
            status: subStatus,
            assignee_id: members[(j + k + s) % members.length].id
          });
        }
      }

      if (isCompleted) {
        pbi.actual_hours = round2(pbiActual);
        const first = members[j % members.length];
        collaborators.push({ pbi_id: pbi.id, user_id: first.id });
        if (j % 2 === 0) {
          const second = members[(j + 1) % members.length];
          if (second.id !== first.id) collaborators.push({ pbi_id: pbi.id, user_id: second.id });
        }
      }
    });
  }

  return { users, teams, teamMembers, projects, projectMembers, sprints, pbis, tasks, subTasks, collaborators };
}

// The table counts buildDataset() produces, used to verify a seeded database.
export function expectedCounts(dataset = buildDataset()) {
  return {
    users: dataset.users.length,
    teams: dataset.teams.length,
    team_members: dataset.teamMembers.length,
    projects: dataset.projects.length,
    project_members: dataset.projectMembers.length,
    sprints: dataset.sprints.length,
    product_backlog_items: dataset.pbis.length,
    tasks: dataset.tasks.length,
    sub_tasks: dataset.subTasks.length,
    pbi_collaborators: dataset.collaborators.length,
    password_reset_tokens: 0
  };
}

// Counts every dataset table and fingerprints the deterministic columns
// (no generated timestamps or password hashes), so two seeded databases - or
// one database before and after a benchmark - can be compared exactly.
export async function summariseDataset(pool) {
  const counts = {};
  for (const table of Object.keys(expectedCounts())) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    counts[table] = rows[0].n;
  }

  const { rows } = await pool.query(`
    SELECT md5(
      (SELECT string_agg(concat_ws('|', id, name, email, role), ',' ORDER BY id) FROM users) ||
      (SELECT string_agg(concat_ws('|', id, name, responsible_admin_id), ',' ORDER BY id) FROM projects) ||
      (SELECT string_agg(concat_ws('|', project_id, user_id), ',' ORDER BY project_id, user_id) FROM project_members) ||
      (SELECT string_agg(concat_ws('|', id, project_id, name, status, started_at), ',' ORDER BY id) FROM sprints) ||
      (SELECT string_agg(concat_ws('|', id, project_id, sprint_id, title, stage, planned_start_date,
                                   planned_end_date, estimated_hours, actual_hours, completed_at), ',' ORDER BY id)
         FROM product_backlog_items) ||
      (SELECT string_agg(concat_ws('|', id, pbi_id, title, status, assignee_id, actual_hours, completed_at), ',' ORDER BY id)
         FROM tasks) ||
      (SELECT string_agg(concat_ws('|', id, task_id, title, status, assignee_id), ',' ORDER BY id) FROM sub_tasks) ||
      (SELECT string_agg(concat_ws('|', pbi_id, user_id), ',' ORDER BY pbi_id, user_id) FROM pbi_collaborators)
    ) AS fingerprint`);

  return { counts, fingerprint: rows[0].fingerprint };
}
