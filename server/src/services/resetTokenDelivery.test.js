import { describe, it, expect } from 'vitest';
import { buildPasswordResetUrl } from './resetTokenDelivery.js';

describe('resetTokenDelivery', () => {
  it('builds a reset URL that does not leak extra query data', () => {
    const url = buildPasswordResetUrl('abc+token', 'http://localhost:5173/');
    expect(url).toBe('http://localhost:5173/reset-password?token=abc%2Btoken');
  });
});
