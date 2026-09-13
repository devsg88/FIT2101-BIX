import { describe, it, expect } from 'vitest';
import { BOARD_STAGES, isBoardStage } from './boardStages.js';

describe('BOARD_STAGES', () => {
  it('has exactly the four required stages, in this order', () => {
    expect(BOARD_STAGES).toEqual([
      'product_backlog',
      'sprint_planning',
      'active_sprint',
      'completed'
    ]);
  });

  it('cannot be changed at runtime', () => {
    expect(() => {
      BOARD_STAGES.push('extra_stage');
    }).toThrow();
  });
});

describe('isBoardStage', () => {
  it('returns true for each real stage name', () => {
    for (const stage of BOARD_STAGES) {
      expect(isBoardStage(stage)).toBe(true);
    }
  });

  it('returns false for anything else', () => {
    expect(isBoardStage('done')).toBe(false);
    expect(isBoardStage('')).toBe(false);
    expect(isBoardStage(undefined)).toBe(false);
  });
});
