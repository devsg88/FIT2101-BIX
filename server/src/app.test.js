import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import app from './app.js';

// US-11 — Yichi Zhang
// Importing app.js used to throw ReferenceError when sprintRoutes was
// replaced by taskRoutes instead of being added alongside it.
const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

describe('app bootstrap', () => {
  it('imports without throwing', () => {
    expect(typeof app).toBe('function');
  });

  it('keeps both sprintRoutes and taskRoutes imports', () => {
    expect(appSource).toMatch(/import sprintRoutes from '\.\/routes\/sprintRoutes\.js'/);
    expect(appSource).toMatch(/import taskRoutes from '\.\/routes\/taskRoutes\.js'/);
    expect(appSource).toMatch("app.use('/api/projects', sprintRoutes)");
    expect(appSource).toMatch("app.use('/api/projects', taskRoutes)");
  });
});
