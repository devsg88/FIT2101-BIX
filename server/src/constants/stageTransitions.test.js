import { describe, it, expect } from 'vitest';
import { checkStageTransition } from './stageTransitions.js';

const ALL_STAGES = [
  'product_backlog',
  'sprint_planning',
  'active_sprint',
  'completed'
];

describe('checkStageTransition', () => {
  it('allows the three defined moves', () => {
    expect(checkStageTransition('product_backlog', 'sprint_planning')).toEqual({
      allowed: true
    });
    expect(checkStageTransition('sprint_planning', 'active_sprint')).toEqual({
      allowed: true
    });
    expect(checkStageTransition('active_sprint', 'completed')).toEqual({
      allowed: true
    });
  });

  it('rejects moving backward', () => {
    const result = checkStageTransition('sprint_planning', 'product_backlog');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cannot move a pbi/i);
  });

  it('rejects skipping a stage', () => {
    expect(checkStageTransition('product_backlog', 'active_sprint').allowed).toBe(false);
    expect(checkStageTransition('product_backlog', 'completed').allowed).toBe(false);
    expect(checkStageTransition('sprint_planning', 'completed').allowed).toBe(false);
  });

  it('rejects "moving" a PBI to the stage it is already on', () => {
    for (const stage of ALL_STAGES) {
      expect(checkStageTransition(stage, stage).allowed).toBe(false);
    }
  });

  it('has no allowed move out of completed, it is the end of the workflow', () => {
    for (const stage of ALL_STAGES) {
      expect(checkStageTransition('completed', stage).allowed).toBe(false);
    }
  });

  it('rejects an unrecognised current stage with a clear reason', () => {
    const result = checkStageTransition('archived', 'sprint_planning');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unknown current stage/i);
  });

  it('rejects an unrecognised target stage with a clear reason', () => {
    const result = checkStageTransition('product_backlog', 'in_review');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unknown target stage/i);
  });

  it('every rejection includes a human-readable reason', () => {
    const rejections = [
      checkStageTransition('completed', 'product_backlog'),
      checkStageTransition('product_backlog', 'product_backlog'),
      checkStageTransition('nonsense', 'sprint_planning'),
      checkStageTransition('product_backlog', 'nonsense')
    ];

    for (const result of rejections) {
      expect(result.allowed).toBe(false);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
