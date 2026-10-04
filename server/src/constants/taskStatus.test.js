import { describe, it, expect } from 'vitest';
import { TASK_STATUSES, isTaskStatus, editStatusTransitionError } from './taskStatus.js';

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

// US-11 owns completion; the generic Admin Edit may not move work into or out of done.
describe('editStatusTransitionError', () => {
  it.each([
    ['todo', 'todo'],
    ['todo', 'in_progress'],
    ['in_progress', 'todo'],
    ['in_progress', 'in_progress'],
    ['done', 'done']
  ])('allows %s -> %s', (from, to) => {
    expect(editStatusTransitionError(from, to, 'task')).toBeNull();
  });

  it.each([['todo'], ['in_progress']])('refuses %s -> done (completion belongs to US-11)', (from) => {
    expect(editStatusTransitionError(from, 'done', 'task')).toBe(
      'A task can only be marked done through the Complete action'
    );
  });

  it.each([['todo'], ['in_progress']])('refuses reopening done -> %s', (to) => {
    expect(editStatusTransitionError('done', to, 'sub-task')).toBe(
      'A completed sub-task cannot be reopened through Edit'
    );
  });
});
