/** Jest config riêng cho flow test; unit test dùng config trong package.json. */
module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: 'test/flows/.*\\.flow\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@/(.*)$': '<rootDir>/src/modules/$1',
  },
  globalSetup: '<rootDir>/test/support/global-setup.ts',
  globalTeardown: '<rootDir>/test/support/global-teardown.ts',
  setupFiles: ['<rootDir>/test/support/env.ts'],
  // chung một DB nên chạy tuần tự
  maxWorkers: 1,
  testTimeout: 30000,
};
