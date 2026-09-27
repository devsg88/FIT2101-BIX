import { describe, it, expect } from 'vitest';
import { TASK_STATUSES, isTaskStatus } from './taskStatus.js';

describe('TASK_STATUSES / isTaskStatus', () => {
  it('is exactly todo, in_progress, done, in that order', () => {
    expect(TASK_STATUSES).toEqual(['todo', 'in_progress', 'done']);
  });

  it('accepts every real status', () => {
    for (const status of TASK_STATUSES) {
      expect(isTaskStatus(status)).toBe(true);
    }
  });

  it('rejects anything else, including null/undefined and PBI stage names', () => {
    expect(isTaskStatus('bogus')).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
    expect(isTaskStatus('')).toBe(false);
    // Easy mistake to make: these are PBI stages (boardStages.js), not task
    // statuses - confirms the two vocabularies are not accidentally shared.
    expect(isTaskStatus('product_backlog')).toBe(false);
    expect(isTaskStatus('completed')).toBe(false);
  });
});
