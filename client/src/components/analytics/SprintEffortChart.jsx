import EffortChart from './EffortChart.jsx';

export default function SprintEffortChart({ sprints, developers, effort }) {
  return (
    <EffortChart groups={sprints} groupKey="sprint_id" developers={developers} effort={effort} />
  );
}
