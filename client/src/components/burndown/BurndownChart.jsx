// US-15 Sprint Burndown Chart (SCRUM-158).
//
// Plain SVG line chart, no chart library: Sprint days along the bottom,
// remaining Story Points up the side. `series` is the backend's
// [{ date: 'YYYY-MM-DD', ideal, actual }] list (see
// server/src/utils/burndown.js), so nothing here calculates burndown values,
// it only draws them.

const WIDTH = 720;
const HEIGHT = 360;
const PAD = { top: 20, right: 24, bottom: 56, left: 64 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
const Y_TICKS = 5;
const MAX_X_LABELS = 8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-08-17' -> '17 Aug'. Read from the string itself so the browser's time
// zone can never move the label to a different day.
export function formatDayLabel(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function roundLabel(value) {
  return Math.round(value * 10) / 10;
}

export default function BurndownChart({ series, totalPoints }) {
  const maxY = Math.max(
    totalPoints,
    ...series.map((point) => Math.max(point.ideal, point.actual ?? 0)),
    1
  );
  const steps = Math.max(series.length - 1, 1);

  const x = (index) => PAD.left + (index / steps) * PLOT_WIDTH;
  const y = (value) => PAD.top + PLOT_HEIGHT - (value / maxY) * PLOT_HEIGHT;

  const idealPoints = series
    .map((point, index) => `${x(index)},${y(point.ideal)}`)
    .join(' ');

  const yTicks = Array.from({ length: Y_TICKS }, (_, i) => (maxY * i) / (Y_TICKS - 1));
  const labelEvery = Math.ceil(series.length / MAX_X_LABELS);
  const bottom = PAD.top + PLOT_HEIGHT;

  return (
    <figure className="burndown-chart">
      <svg
        className="burndown-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Burndown chart over ${series.length} Sprint days, starting at ${totalPoints} Story Points`}
      >
        {yTicks.map((value) => (
          <g key={value}>
            <line
              className="burndown-chart__grid"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="burndown-chart__tick" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
              {roundLabel(value)}
            </text>
          </g>
        ))}

        {series.map((point, index) =>
          index % labelEvery === 0 || index === series.length - 1 ? (
            <text
              key={point.date}
              className="burndown-chart__tick"
              x={x(index)}
              y={bottom + 18}
              textAnchor="middle"
            >
              {formatDayLabel(point.date)}
            </text>
          ) : null
        )}

        <line className="burndown-chart__axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={bottom} />
        <line className="burndown-chart__axis" x1={PAD.left} x2={WIDTH - PAD.right} y1={bottom} y2={bottom} />

        <text className="burndown-chart__axis-title" x={PAD.left + PLOT_WIDTH / 2} y={HEIGHT - 8} textAnchor="middle">
          Sprint day
        </text>
        <text
          className="burndown-chart__axis-title"
          x={16}
          y={PAD.top + PLOT_HEIGHT / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${PAD.top + PLOT_HEIGHT / 2})`}
        >
          Remaining Story Points
        </text>

        <polyline
          className="burndown-chart__ideal"
          data-testid="burndown-ideal-line"
          points={idealPoints}
        />
      </svg>
    </figure>
  );
}
