// @testing-library/jest-dom v6 must use the vitest entrypoint so its matchers
// register on vitest's scoped `expect` (the plain import expects a global
// `expect`, which needs `globals: true` in the vitest config - not set here).
import '@testing-library/jest-dom/vitest';

// Without `globals: true`, @testing-library/react does not auto-register its
// afterEach cleanup, so rendered DOM leaks between test cases. Register it here.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
