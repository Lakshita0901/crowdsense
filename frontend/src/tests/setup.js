import '@testing-library/jest-dom';
import { beforeAll, afterAll, afterEach } from 'vitest';

// Stub global APIs if needed in testing environment.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
