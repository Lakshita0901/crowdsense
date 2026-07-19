import '@testing-library/jest-dom';
// Stub global APIs if needed in testing environment.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
