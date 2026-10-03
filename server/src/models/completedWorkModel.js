import { getProjectById } from './boardModel.js';
import { getPbisByStage, getTasksByProject, getSubTasksByProject } from './pbiModel.js';
import { getSprintsByProject } from './sprintModel.js';
import { getCollaboratorsByProject } from './completionModel.js';

// US-12: Completed Work History.
//
// Loads every PBI a project has moved to Completed (the terminal stage
// written by US-11's stage move, see updatePbiStage in ./pbiModel.js),
// together with its Tasks and Sub-tasks, so a completed record stays
// associated with exactly the work items it was made of. Returns null when
// the project does not exist, so the caller can turn that into a 404.
//
// Completion data recorded under US-11 rides along for free: getPbisByStage
// already selects actual_hours via PBI_COLUMNS, so a completed PBI's
// actual_hours comes back with it, whatever was last written for that PBI.
// collaborators is joined in from pbi_collaborators (also written by US-11's
// completePbi, see completionModel.js) the same way sprint_name is joined in
// below - neither is fabricated here, both simply reflect whatever US-11
// actually recorded, which may still be nothing for an older completed PBI.
// There is still no dedicated completed-at/completed-by column (only the
// generic updated_at trigger) - see server/db/README.md.
//
// sprint_name is resolved here (a join in JS, not SQL) purely so the history
// list has a readable Sprint label to show instead of the bare sprint_id
// foreign key that's already on each PBI row - it is not new completion data,
// just an existing relationship (product_backlog_items.sprint_id ->
// sprints.id) presented in a human-readable form.
//
// Nesting mirrors boardModel.getBoard (fetch flat lists per project, group in
// JS with the same groupBy helper), but scoped to stage = 'completed' only
// and shaped PBI-first rather than grouped by stage, since a completed
// record has no further stage to move through.
export async function getCompletedWorkByProject(projectId) {
  const [project, completedPbis, tasks, subTasks, sprints, collaborators] = await Promise.all([
    getProjectById(projectId),
    getPbisByStage(projectId, 'completed'),
    getTasksByProject(projectId),
    getSubTasksByProject(projectId),
    getSprintsByProject(projectId),
    getCollaboratorsByProject(projectId)
  ]);

  if (!project) {
    return null;
  }

  // Bigint columns (sprint_id, sprints.id) come back from the real database
  // as strings, not numbers - String(...) on both sides keeps the lookup
  // working the same way whether this runs against Postgres or against
  // plain-number test fixtures.
  const sprintNameById = new Map(sprints.map((sprint) => [String(sprint.id), sprint.name]));
  const sprintNameFor = (pbi) =>
    pbi.sprint_id == null ? null : sprintNameById.get(String(pbi.sprint_id)) ?? null;

  // Same grouping pattern as tasksByPbi below, just keyed off a different
  // bulk, per-project query (getCollaboratorsByProject) instead of a loop
  // calling getCollaboratorsForPbi once per completed PBI.
  const collaboratorsByPbi = groupBy(collaborators, 'pbi_id');

  // getTasksByProject/getSubTasksByProject return every task/sub-task in the
  // project (same convention boardModel.getBoard relies on), so they are
  // narrowed down here to only those hanging off a completed PBI.
  const completedPbiIds = new Set(completedPbis.map((pbi) => pbi.id));
  const tasksForCompletedPbis = tasks.filter((task) => completedPbiIds.has(task.pbi_id));
  const completedTaskIds = new Set(tasksForCompletedPbis.map((task) => task.id));
  const subTasksForCompletedTasks = subTasks.filter((subTask) =>
    completedTaskIds.has(subTask.task_id)
  );

  const subTasksByTask = groupBy(subTasksForCompletedTasks, 'task_id');
  const tasksByPbi = groupBy(
    tasksForCompletedPbis.map((task) => ({
      ...task,
      subTasks: subTasksByTask[task.id] ?? []
    })),
    'pbi_id'
  );

  return {
    project,
    pbis: completedPbis.map((pbi) => ({
      ...pbi,
      sprint_name: sprintNameFor(pbi),
      collaborators: collaboratorsByPbi[pbi.id] ?? [],
      tasks: tasksByPbi[pbi.id] ?? []
    }))
  };
}

function groupBy(rows, key) {
  const map = {};
  for (const row of rows) {
    const groupKey = row[key];
    if (!map[groupKey]) {
      map[groupKey] = [];
    }
    map[groupKey].push(row);
  }
  return map;
}
