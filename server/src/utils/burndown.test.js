import { describe, it, expect } from 'vitest';
import {
  EMPTY_REASONS,
  MAX_SPRINT_DAYS,
  toDateKey,
  addDays,
  listDateKeys,
  getSprintWindow,
  storyPoints,
  sumStoryPoints,
  idealSeries,
  completionDateKey,
  actualSeries,
  buildBurndown
} from './burndown.js';

// Local-time dates, matching how pg hands back DATE / timestamptz values.
const day = (year, month, date, hour = 12) => new Date(year, month - 1, date, hour);

const activeSprint = {
  id: 2,
  name: 'Sprint 2',
  status: 'active',
  started_at: day(2026, 8, 17, 9)
};

function pbi(overrides) {
  return {
    stage: 'active_sprint',
    estimated_hours: '5.00',
    planned_end_date: day(2026, 8, 21, 0),
    completed_at: null,
    updated_at: day(2026, 8, 10),
    ...overrides
  };
}

describe('date helpers', () => {
  it('keeps a YYYY-MM-DD string as it is', () => {
    expect(toDateKey('2026-08-17')).toBe('2026-08-17');
  });

  it('reads a Date by its local calendar day', () => {
    expect(toDateKey(day(2026, 8, 17, 0))).toBe('2026-08-17');
    expect(toDateKey(day(2026, 8, 17, 23))).toBe('2026-08-17');
  });

  it('returns null for missing or unreadable values', () => {
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey(undefined)).toBeNull();
    expect(toDateKey('not a date')).toBeNull();
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lists every day from start to end inclusive', () => {
    expect(listDateKeys('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'
    ]);
    expect(listDateKeys('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
    expect(listDateKeys('2026-08-18', '2026-08-17')).toEqual([]);
  });
});

describe('getSprintWindow', () => {
  it('uses started_at as the start and the latest planned end date as the end', () => {
    const pbis = [
      pbi({ planned_end_date: day(2026, 8, 21, 0) }),
      pbi({ planned_end_date: day(2026, 8, 28, 0) }),
      pbi({ planned_end_date: null })
    ];

    expect(getSprintWindow(activeSprint, pbis)).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-28'
    });
  });

  it('has no start before the Sprint is started and no end without planned end dates', () => {
    expect(
      getSprintWindow({ ...activeSprint, started_at: null }, [pbi({ planned_end_date: null })])
    ).toEqual({ startDate: null, endDate: null });
  });
});

describe('Story Points', () => {
  it('reads estimated_hours, including pg numeric strings', () => {
    expect(storyPoints({ estimated_hours: '3.50' })).toBe(3.5);
    expect(storyPoints({ estimated_hours: 8 })).toBe(8);
  });

  it('counts an item with no usable estimate as 0', () => {
    expect(storyPoints({ estimated_hours: null })).toBe(0);
    expect(storyPoints({ estimated_hours: 'abc' })).toBe(0);
    expect(storyPoints({ estimated_hours: '-2' })).toBe(0);
  });

  it('sums without floating point noise', () => {
    expect(sumStoryPoints([{ estimated_hours: '0.10' }, { estimated_hours: '0.20' }])).toBe(0.3);
  });
});

describe('idealSeries', () => {
  it('goes in a straight line from the committed total to 0 on the last day', () => {
    const keys = listDateKeys('2026-08-17', '2026-08-21');

    expect(idealSeries(20, keys).map((point) => point.ideal)).toEqual([20, 15, 10, 5, 0]);
  });

  it('is 0 for a one-day Sprint', () => {
    expect(idealSeries(8, ['2026-08-17'])).toEqual([{ date: '2026-08-17', ideal: 0 }]);
  });
});

describe('completionDateKey', () => {
  it('is null while the item is not Done', () => {
    expect(completionDateKey(pbi({ stage: 'active_sprint', completed_at: day(2026, 8, 18) }))).toBeNull();
  });

  it('uses completed_at, falling back to updated_at', () => {
    expect(completionDateKey(pbi({ stage: 'completed', completed_at: day(2026, 8, 18) }))).toBe('2026-08-18');
    expect(
      completionDateKey(pbi({ stage: 'completed', completed_at: null, updated_at: day(2026, 8, 19) }))
    ).toBe('2026-08-19');
  });
});

describe('actualSeries', () => {
  const keys = listDateKeys('2026-08-17', '2026-08-21');

  it('removes a Story\'s points from the day it was completed onward', () => {
    const pbis = [
      pbi({ estimated_hours: '5', stage: 'completed', completed_at: day(2026, 8, 18) }),
      pbi({ estimated_hours: '3' })
    ];

    expect(actualSeries(pbis, keys, '2026-08-21').map((point) => point.actual)).toEqual([8, 3, 3, 3, 3]);
  });

  it('stops at today: future days are null', () => {
    const pbis = [pbi({ estimated_hours: '4' })];

    expect(actualSeries(pbis, keys, '2026-08-19').map((point) => point.actual)).toEqual([4, 4, 4, null, null]);
  });

  it('removes an item completed before the Sprint started from day one', () => {
    const pbis = [
      pbi({ estimated_hours: '2', stage: 'completed', completed_at: day(2026, 8, 12) }),
      pbi({ estimated_hours: '6' })
    ];

    expect(actualSeries(pbis, keys, '2026-08-21')[0].actual).toBe(6);
  });

  it('reaches 0 once every item is Done', () => {
    const pbis = [
      pbi({ estimated_hours: '5', stage: 'completed', completed_at: day(2026, 8, 18) }),
      pbi({ estimated_hours: '3', stage: 'completed', completed_at: day(2026, 8, 20) })
    ];

    expect(actualSeries(pbis, keys, '2026-08-21').map((point) => point.actual)).toEqual([8, 3, 3, 0, 0]);
  });
});

describe('buildBurndown', () => {
  const today = day(2026, 8, 19);

  it('returns the full data contract for a Sprint with usable data', () => {
    const pbis = [
      pbi({ estimated_hours: '6', stage: 'completed', completed_at: day(2026, 8, 18) }),
      pbi({ estimated_hours: '2', planned_end_date: day(2026, 8, 20, 0) })
    ];

    expect(buildBurndown(activeSprint, pbis, today)).toEqual({
      sprint: {
        id: 2,
        name: 'Sprint 2',
        status: 'active',
        startDate: '2026-08-17',
        endDate: '2026-08-21'
      },
      totalPoints: 8,
      remainingPoints: 2,
      series: [
        { date: '2026-08-17', ideal: 8, actual: 8 },
        { date: '2026-08-18', ideal: 6, actual: 2 },
        { date: '2026-08-19', ideal: 4, actual: 2 },
        { date: '2026-08-20', ideal: 2, actual: null },
        { date: '2026-08-21', ideal: 0, actual: null }
      ],
      emptyReason: null
    });
  });

  it('fills every actual value for a Sprint that has already ended', () => {
    const result = buildBurndown(
      { ...activeSprint, status: 'completed' },
      [pbi({ estimated_hours: '4', stage: 'completed', completed_at: day(2026, 8, 20) })],
      day(2026, 9, 30)
    );

    expect(result.series.every((point) => point.actual !== null)).toBe(true);
    expect(result.series.at(-1).actual).toBe(0);
  });

  it('is empty with not_started for a Sprint still in planning', () => {
    const result = buildBurndown(
      { ...activeSprint, status: 'planning', started_at: null },
      [pbi()],
      today
    );

    expect(result.emptyReason).toBe(EMPTY_REASONS.NOT_STARTED);
    expect(result.series).toEqual([]);
  });

  it('is empty with no_estimates when the Sprint has no items or no Story Points', () => {
    expect(buildBurndown(activeSprint, [], today).emptyReason).toBe(EMPTY_REASONS.NO_ESTIMATES);
    expect(
      buildBurndown(activeSprint, [pbi({ estimated_hours: null })], today).emptyReason
    ).toBe(EMPTY_REASONS.NO_ESTIMATES);
  });

  it('is empty with no_end_date when no item has a planned end date', () => {
    const result = buildBurndown(activeSprint, [pbi({ planned_end_date: null })], today);

    expect(result.emptyReason).toBe(EMPTY_REASONS.NO_END_DATE);
    expect(result.series).toEqual([]);
  });

  it('is empty with invalid_dates when the end falls before the start', () => {
    const result = buildBurndown(activeSprint, [pbi({ planned_end_date: day(2026, 8, 10, 0) })], today);

    expect(result.emptyReason).toBe(EMPTY_REASONS.INVALID_DATES);
  });

  it('is empty with invalid_dates when the Sprint would be longer than the limit', () => {
    const tooLate = addDays('2026-08-17', MAX_SPRINT_DAYS);
    const result = buildBurndown(activeSprint, [pbi({ planned_end_date: tooLate })], today);

    expect(result.emptyReason).toBe(EMPTY_REASONS.INVALID_DATES);
    expect(result.series).toEqual([]);
  });

  it('still reports the totals when it is empty', () => {
    const result = buildBurndown(activeSprint, [pbi({ estimated_hours: '5', planned_end_date: null })], today);

    expect(result.totalPoints).toBe(5);
    expect(result.remainingPoints).toBe(5);
  });
});
