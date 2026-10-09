// US-15 Sprint Burndown Chart (SCRUM-153).
//
// Pure helpers used to build the burndown data. Nothing in this file touches
// the database, so every rule here can be unit tested on plain objects.
//
// Data contract for GET /api/projects/:projectId/sprints/:sprintId/burndown
//
//   {
//     sprint: {
//       id, name, status,
//       startDate,          // 'YYYY-MM-DD' or null
//       endDate             // 'YYYY-MM-DD' or null
//     },
//     totalPoints,          // Story Points committed to the Sprint
//     remainingPoints,      // Story Points of Sprint items not yet Done
//     series: [             // one entry per Sprint day, start to end
//       { date, ideal, actual }   // actual is null for days still to come
//     ],
//     emptyReason           // null, or one of EMPTY_REASONS below
//   }
//
// When emptyReason is set, series is always an empty array and the client
// shows an empty state instead of a chart.
//
// Where the numbers come from:
//   Story Points  product_backlog_items.estimated_hours, the field the board
//                 labels "Story points / hours" (US-08b).
//   Done          a PBI whose stage is 'completed' (US-11).
//   Done on       product_backlog_items.completed_at, falling back to
//                 updated_at for items completed before that column existed.
//   Sprint start  sprints.started_at, set by Start Sprint (US-10).
//   Sprint end    the latest planned_end_date of the Sprint's items (US-08b).
//                 The sprints table has no end date column of its own.

export const EMPTY_REASONS = Object.freeze({
  NOT_STARTED: 'not_started',
  NO_ESTIMATES: 'no_estimates',
  NO_END_DATE: 'no_end_date',
  INVALID_DATES: 'invalid_dates'
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Turns a Date, a timestamp or a 'YYYY-MM-DD' string into a 'YYYY-MM-DD' key.
// pg returns DATE columns as local midnight, so local getters are used to keep
// the same calendar day the database stored. Returns null for missing or
// unreadable values.
export function toDateKey(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && DATE_KEY.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Adds whole days to a 'YYYY-MM-DD' key. Done in UTC so daylight saving
// changes can never skip or repeat a day.
export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

// Every date from startKey to endKey, both included. Empty when the end is
// before the start. 'YYYY-MM-DD' keys sort correctly as plain strings.
export function listDateKeys(startKey, endKey) {
  const keys = [];
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    keys.push(key);
  }
  return keys;
}

// The Sprint's start and end as 'YYYY-MM-DD' keys (see the contract above).
// Either may be null: a Sprint still in planning has no start, and a Sprint
// whose items have no planned end dates has no end.
export function getSprintWindow(sprint, pbis) {
  const startDate = toDateKey(sprint.started_at);
  const endDates = pbis
    .map((pbi) => toDateKey(pbi.planned_end_date))
    .filter(Boolean)
    .sort();
  const endDate = endDates.length > 0 ? endDates[endDates.length - 1] : null;

  return { startDate, endDate };
}
