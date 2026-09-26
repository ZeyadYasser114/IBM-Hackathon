/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Never run compiled output: dist/ suites are stale duplicates of src/
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
