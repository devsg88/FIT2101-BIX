// US-15 Sprint Burndown Chart (SCRUM-153).
//
// Pure helpers used to build the burndown data. Nothing in this file touches
// the database, so every rule here can be unit tested on plain objects.

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
