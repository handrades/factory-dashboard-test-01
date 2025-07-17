// Integration test setup
import { jest } from '@jest/globals';

// Mock winston logger to prevent console spam during tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    json: jest.fn(),
    timestamp: jest.fn(),
    combine: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  console.log('Starting integration test suite...');
});

afterAll(() => {
  console.log('Integration test suite completed.');
});