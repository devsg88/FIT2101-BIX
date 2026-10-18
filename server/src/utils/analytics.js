// PBI hours roll up Task hours; never add both. Task-less PBIs and Tasks
// without a developer have no recorded per-developer allocation, so keep
// them separate rather than dividing hours between collaborators.
// TODO: Confirm the client's average-time denominator before adding averages.
function buildGroupedAnalytics(groups, totals, collection, dimension, allowUnknownGroups) {
  const groupIds = new Set(groups.map((group) => String(group.id)));
  const developers = new Map();
  const effort = [];
  const unattributed = new Map();

  for (const row of totals) {
    const groupId = row[dimension] == null ? null : String(row[dimension]);
    if (!allowUnknownGroups && !groupIds.has(groupId)) continue;
    const counts = {
      actual_hours: Number(row.actual_hours),
      recorded_items: Number(row.recorded_items),
      missing_actual_hours: Number(row.missing_actual_hours)
    };
    if (row.developer_id != null && groupIds.has(groupId)) {
      const developerId = String(row.developer_id);
      developers.set(developerId, { id: developerId, name: row.developer_name });
      effort.push({ [dimension]: groupId, developer_id: developerId, ...counts });
    } else {
      const key = groupIds.has(groupId) ? groupId : null;
      const group = unattributed.get(key) ?? {
        [dimension]: key, actual_hours: 0, recorded_items: 0, missing_actual_hours: 0
      };
      group.actual_hours = Number((group.actual_hours + counts.actual_hours).toFixed(2));
      group.recorded_items += counts.recorded_items;
      group.missing_actual_hours += counts.missing_actual_hours;
      unattributed.set(key, group);
    }
  }

  return {
    [collection]: groups.map((group) => ({ ...group, id: String(group.id) })),
    developers: [...developers.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    effort,
    unattributed: [...unattributed.values()]
  };
}

export function buildSprintAnalytics(sprints, totals) {
  return buildGroupedAnalytics(sprints, totals, 'sprints', 'sprint_id', true);
}

export function buildProjectAnalytics(projects, totals) {
  return buildGroupedAnalytics(projects, totals, 'projects', 'project_id', false);
}
