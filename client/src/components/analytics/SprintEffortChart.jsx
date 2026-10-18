const formatHours = (hours) => Number(hours).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function SprintEffortChart({ sprints, developers, effort }) {
  const maxHours = effort.reduce((max, point) => Math.max(max, point.actual_hours), 1);
  const byDeveloper = new Map();
  for (const point of effort) {
    if (!byDeveloper.has(point.developer_id)) byDeveloper.set(point.developer_id, new Map());
    byDeveloper.get(point.developer_id).set(point.sprint_id, point);
  }

  return (
    <div className="sprint-effort">
      <div className="sprint-effort__scale" aria-hidden="true">
        <span>0 h</span><span>{formatHours(maxHours / 2)} h</span><span>{formatHours(maxHours)} h</span>
      </div>
      {developers.map((developer) => (
        <figure className="sprint-effort__developer" key={developer.id}>
          <figcaption>{developer.name} <span>#{developer.id}</span></figcaption>
          {sprints.map((sprint, index) => {
            const point = byDeveloper.get(developer.id)?.get(sprint.id);
            const hours = point?.actual_hours ?? 0;
            const missing = point?.missing_actual_hours ?? 0;
            const onlyMissing = missing > 0 && !point.recorded_items;
            const label = `${developer.name} (#${developer.id}), ${sprint.name} (#${sprint.id}): ` +
              `${onlyMissing ? 'Actual Hours not recorded' : `${formatHours(hours)} actual hours`}` +
              (missing ? `; ${missing} work items missing Actual Hours` : '');
            return (
              <div className="sprint-effort__row" key={sprint.id} role="img" aria-label={label}>
                <span className="sprint-effort__sprint">{sprint.name} <small>#{sprint.id}</small></span>
                <div className="sprint-effort__track" aria-hidden="true">
                  <div className={`sprint-effort__bar sprint-effort__bar--${index % 3}`}
                    style={{ width: `${hours / maxHours * 100}%` }} />
                </div>
                <span className="sprint-effort__value" aria-hidden="true">
                  {onlyMissing ? 'Not recorded' : `${formatHours(hours)} h`}
                  {missing > 0 && <small>{missing} unrecorded</small>}
                </span>
              </div>
            );
          })}
        </figure>
      ))}
    </div>
  );
}
