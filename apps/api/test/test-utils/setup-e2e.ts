import { DatabaseHelper } from './database.helper';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/talent_radar_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Initialize test database
  await DatabaseHelper.initializeTestDatabase();
}, 30000);

// Clear data before each test
beforeEach(async () => {
  await DatabaseHelper.clearDatabase();
}, 10000);

// Global test teardown
afterAll(async () => {
  await DatabaseHelper.closeDatabase();
}, 10000);

// Custom Jest matchers for API testing
expect.extend({
  toBeSuccessfulResponse(received) {
    const pass = received.success === true && received.data !== undefined;
    if (pass) {
      return {
        message: () => `expected response not to be successful`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected response to be successful with data, received: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  },

  toHaveValidPagination(received) {
    const pass = 
      received.pagination &&
      typeof received.pagination.page === 'number' &&
      typeof received.pagination.limit === 'number' &&
      typeof received.pagination.total === 'number' &&
      typeof received.pagination.pages === 'number';
    
    if (pass) {
      return {
        message: () => `expected response not to have valid pagination`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected response to have valid pagination structure`,
        pass: false,
      };
    }
  },

  toBeValidApiError(received) {
    const pass = 
      received.success === false &&
      received.error &&
      typeof received.error.message === 'string';
    
    if (pass) {
      return {
        message: () => `expected response not to be a valid API error`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected response to be a valid API error with message`,
        pass: false,
      };
    }
  },
});

// Extend Jest types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeSuccessfulResponse(): R;
      toHaveValidPagination(): R;
      toBeValidApiError(): R;
    }
  }
}