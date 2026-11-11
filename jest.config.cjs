const { createJsWithTsPreset } = require('ts-jest');

const preset = createJsWithTsPreset({
  tsconfig: '<rootDir>/tsconfig.jest.json',
});

module.exports = {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transformIgnorePatterns: ['/node_modules/(?!chai/)'],
  setupFiles: ['source-map-support/register'],
  setupFilesAfterEnv: ['<rootDir>/test/support/restore-env-after-each.ts'],
  maxWorkers: 1,
  testTimeout: 30000,
};
