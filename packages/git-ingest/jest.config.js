/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  // Never run compiled output: dist/ suites are stale duplicates of src/
  // and once masked a real failure behind passing stale tests.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
