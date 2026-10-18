// PBI hours roll up Task hours; never add both. Task-less PBIs and Tasks
// without a developer have no recorded per-developer allocation, so keep
// them separate rather than dividing hours between collaborators.
// TODO: Confirm the client's average-time denominator before adding averages.
export function buildSprintAnalytics(sprints, totals) {
  const sprintIds = new Set(sprints.map((sprint) => String(sprint.id)));
  const developers = new Map();
  const effort = [];
  const unattributed = new Map();

  for (const row of totals) {
    const sprintId = row.sprint_id == null ? null : String(row.sprint_id);
    const counts = {
      actual_hours: Number(row.actual_hours),
      recorded_items: Number(row.recorded_items),
      missing_actual_hours: Number(row.missing_actual_hours)
    };
    if (row.developer_id != null && sprintIds.has(sprintId)) {
      const developerId = String(row.developer_id);
      developers.set(developerId, { id: developerId, name: row.developer_name });
      effort.push({ sprint_id: sprintId, developer_id: developerId, ...counts });
    } else {
      const key = sprintIds.has(sprintId) ? sprintId : null;
      const group = unattributed.get(key) ?? {
        sprint_id: key, actual_hours: 0, recorded_items: 0, missing_actual_hours: 0
      };
      group.actual_hours = Number((group.actual_hours + counts.actual_hours).toFixed(2));
      group.recorded_items += counts.recorded_items;
      group.missing_actual_hours += counts.missing_actual_hours;
      unattributed.set(key, group);
    }
  }

  return {
    sprints: sprints.map((sprint) => ({ ...sprint, id: String(sprint.id) })),
    developers: [...developers.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    effort,
    unattributed: [...unattributed.values()]
  };
}
