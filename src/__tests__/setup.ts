/**
 * Test setup and configuration
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

/**
 * Global test setup
 */
beforeAll(async () => {
  // Set test environment variables
  process.env['NODE_ENV'] = 'test';
  
  // Set default test token if not provided
  if (!process.env['YNAB_ACCESS_TOKEN']) {
    process.env['YNAB_ACCESS_TOKEN'] = 'test-token-for-mocked-tests';
  }
  
  // Disable console.error for cleaner test output (except for specific tests)
  if (!process.env['VERBOSE_TESTS']) {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      // Only show errors that are part of test assertions
      if (args[0]?.includes?.('❌') || args[0]?.includes?.('Test')) {
        originalConsoleError(...args);
      }
    };
  }
  
  console.log('🧪 Test environment initialized');
});

/**
 * Global test cleanup
 */
afterAll(async () => {
  // Clean up any global resources
  console.log('🧹 Test environment cleaned up');
});

/**
 * Per-test setup
 */
beforeEach(async () => {
  // Reset environment for each test
  process.env['NODE_ENV'] = 'test';
  
  // Clear any cached modules that might interfere (only if they exist)
  try {
    delete require.cache[require.resolve('../server/YNABMCPServer.js')];
  } catch (error) {
    // Module doesn't exist yet, which is fine
  }
});

/**
 * Per-test cleanup
 */
afterEach(async () => {
  // Clean up any test-specific resources
  // This is handled by individual test files
});

/**
 * Test utilities for environment management
 */
export class TestEnvironment {
  private originalEnv: Record<string, string | undefined> = {};
  
  /**
   * Set environment variables for a test
   */
  setEnv(vars: Record<string, string>): void {
    for (const [key, value] of Object.entries(vars)) {
      this.originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
  }
  
  /**
   * Restore original environment variables
   */
  restoreEnv(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.originalEnv = {};
  }
  
  /**
   * Check if running in CI environment
   */
  isCI(): boolean {
    return !!(process.env['CI'] || process.env['GITHUB_ACTIONS'] || process.env['TRAVIS']);
  }
  
  /**
   * Check if E2E tests should be skipped
   */
  shouldSkipE2E(): boolean {
    return process.env['SKIP_E2E_TESTS'] === 'true' || !process.env['YNAB_ACCESS_TOKEN'] || this.isCI();
  }
  
  /**
   * Get test timeout based on environment
   */
  getTestTimeout(): number {
    if (this.isCI()) {
      return 60000; // 60 seconds in CI
    }
    return 30000; // 30 seconds locally
  }
}

/**
 * Mock console methods for testing
 */
export class MockConsole {
  private originalMethods: Record<string, Function> = {};
  private logs: Array<{ method: string; args: any[] }> = [];
  
  /**
   * Start mocking console methods
   */
  mock(methods: string[] = ['log', 'error', 'warn', 'info']): void {
    for (const method of methods) {
      this.originalMethods[method] = (console as any)[method];
      (console as any)[method] = (...args: any[]) => {
        this.logs.push({ method, args });
      };
    }
  }
  
  /**
   * Restore original console methods
   */
  restore(): void {
    for (const [method, originalFn] of Object.entries(this.originalMethods)) {
      (console as any)[method] = originalFn;
    }
    this.originalMethods = {};
    this.logs = [];
  }
  
  /**
   * Get captured logs
   */
  getLogs(): Array<{ method: string; args: any[] }> {
    return [...this.logs];
  }
  
  /**
   * Get logs for a specific method
   */
  getLogsFor(method: string): any[][] {
    return this.logs.filter(log => log.method === method).map(log => log.args);
  }
  
  /**
   * Check if a specific message was logged
   */
  hasLog(method: string, message: string): boolean {
    return this.logs.some(log => 
      log.method === method && 
      log.args.some(arg => 
        typeof arg === 'string' && arg.includes(message)
      )
    );
  }
}

/**
 * Test data factory
 */
export class TestDataFactory {
  /**
   * Create mock budget data
   */
  static createMockBudget(overrides: Partial<any> = {}): any {
    return {
      id: 'test-budget-id',
      name: 'Test Budget',
      last_modified_on: '2024-01-01T00:00:00Z',
      first_month: '2024-01-01',
      last_month: '2024-12-01',
      date_format: { format: 'MM/DD/YYYY' },
      currency_format: { iso_code: 'USD', example_format: '$123.45' },
      ...overrides
    };
  }
  
  /**
   * Create mock account data
   */
  static createMockAccount(overrides: Partial<any> = {}): any {
    return {
      id: 'test-account-id',
      name: 'Test Account',
      type: 'checking',
      on_budget: true,
      closed: false,
      note: null,
      balance: 100000, // $100.00
      cleared_balance: 95000,
      uncleared_balance: 5000,
      ...overrides
    };
  }
  
  /**
   * Create mock transaction data
   */
  static createMockTransaction(overrides: Partial<any> = {}): any {
    return {
      id: 'test-transaction-id',
      date: '2024-01-15',
      amount: -5000, // $5.00 outflow
      memo: 'Test transaction',
      cleared: 'cleared',
      approved: true,
      flag_color: null,
      account_id: 'test-account-id',
      payee_id: 'test-payee-id',
      category_id: 'test-category-id',
      transfer_account_id: null,
      ...overrides
    };
  }
  
  /**
   * Create mock category data
   */
  static createMockCategory(overrides: Partial<any> = {}): any {
    return {
      id: 'test-category-id',
      category_group_id: 'test-group-id',
      name: 'Test Category',
      hidden: false,
      note: null,
      budgeted: 10000, // $10.00
      activity: -5000,
      balance: 5000,
      goal_type: null,
      ...overrides
    };
  }
  
  /**
   * Create mock payee data
   */
  static createMockPayee(overrides: Partial<any> = {}): any {
    return {
      id: 'test-payee-id',
      name: 'Test Payee',
      transfer_account_id: null,
      ...overrides
    };
  }
  
  /**
   * Create mock user data
   */
  static createMockUser(overrides: Partial<any> = {}): any {
    return {
      id: 'test-user-id',
      email: 'test@example.com',
      ...overrides
    };
  }
}

/**
 * Performance measurement utilities
 */
export class PerformanceTracker {
  private measurements: Map<string, number> = new Map();
  
  /**
   * Start measuring performance
   */
  start(label: string): void {
    this.measurements.set(label, Date.now());
  }
  
  /**
   * End measurement and return duration
   */
  end(label: string): number {
    const startTime = this.measurements.get(label);
    if (!startTime) {
      throw new Error(`No measurement started for label: ${label}`);
    }
    
    const duration = Date.now() - startTime;
    this.measurements.delete(label);
    return duration;
  }
  
  /**
   * Measure a function execution
   */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    this.start(label);
    const result = await fn();
    const duration = this.end(label);
    return { result, duration };
  }
  
  /**
   * Assert performance threshold
   */
  assertDuration(duration: number, maxDuration: number, label?: string): void {
    if (duration > maxDuration) {
      throw new Error(
        `Performance assertion failed${label ? ` for ${label}` : ''}: ` +
        `${duration}ms > ${maxDuration}ms`
      );
    }
  }
}

// Export singleton instances for convenience
export const testEnv = new TestEnvironment();
export const mockConsole = new MockConsole();
export const performanceTracker = new PerformanceTracker();