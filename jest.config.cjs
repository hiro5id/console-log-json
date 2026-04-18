module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  setupFiles: ['source-map-support/register'],
  maxWorkers: 1,
  testTimeout: 30000,
};
