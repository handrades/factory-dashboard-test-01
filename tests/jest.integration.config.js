module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/integration'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '../services/**/*.ts',
    '!../services/**/*.d.ts',
    '!../services/**/__tests__/**',
    '!../services/**/node_modules/**'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/setup/integration-setup.ts'],
  moduleNameMapper: {
    '^@factory-dashboard/shared-types$': '<rootDir>/../services/shared-types/src'
  },
  testTimeout: 30000,
  verbose: true
};