import type { ToolRegistry } from '../server/toolRegistry.js';
/**
 * Test utilities for comprehensive testing suite
 */

import { expect } from 'vitest';
import { YNABMCPServer } from '../server/YNABMCPServer.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Test environment configuration
 */
export interface TestConfig {
  hasRealApiKey: boolean;
  testBudgetId: string | undefined;
  testAccountId: string | undefined;
  skipE2ETests: boolean;
}

/**
 * Get test configuration from environment
 */
export function getTestConfig(): TestConfig {
  const hasRealApiKey = !!process.env['YNAB_ACCESS_TOKEN'];
  const skipE2ETests = process.env['SKIP_E2E_TESTS'] === 'true' || !hasRealApiKey;

  return {
    hasRealApiKey,
    testBudgetId: process.env['TEST_BUDGET_ID'],
    testAccountId: process.env['TEST_ACCOUNT_ID'],
    skipE2ETests,
  };
}

/**
 * Create a test server instance
 */
export async function createTestServer(): Promise<YNABMCPServer> {
  if (!process.env['YNAB_ACCESS_TOKEN']) {
    throw new Error('YNAB_ACCESS_TOKEN is required for testing');
  }

  return new YNABMCPServer();
}

/**
 * Execute a tool call on the server
 */
export async function executeToolCall(
  server: YNABMCPServer,
  toolName: string,
  args: Record<string, any> = {},
): Promise<CallToolResult> {
  const accessToken = process.env['YNAB_ACCESS_TOKEN'];
  if (!accessToken) {
    throw new Error('YNAB_ACCESS_TOKEN is required for tool execution');
  }

  const registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
  const normalizedName = toolName.startsWith('ynab:')
    ? toolName.slice(toolName.indexOf(':') + 1)
    : toolName;

  return await registry.executeTool({
    name: normalizedName,
    accessToken,
    arguments: args,
  });
}

/**
 * Validate tool result structure
 */
export function validateToolResult(result: CallToolResult): void {
  expect(result).toBeDefined();
  expect(result.content).toBeDefined();
  expect(Array.isArray(result.content)).toBe(true);
  expect(result.content.length).toBeGreaterThan(0);

  for (const content of result.content) {
    expect(content.type).toBe('text');
    expect(typeof content.text).toBe('string');
  }
}

/**
 * Check if a CallToolResult contains an error
 */
export function isErrorResult(result: CallToolResult): boolean {
  if (!result.content || result.content.length === 0) {
    return false;
  }

  const content = result.content[0];
  if (!content || content.type !== 'text') {
    return false;
  }

  try {
    const parsed = JSON.parse(content.text);
    return parsed && typeof parsed === 'object' && 'error' in parsed;
  } catch {
    return false;
  }
}

/**
 * Extract error message from a CallToolResult that contains an error
 */
export function getErrorMessage(result: CallToolResult): string {
  if (!isErrorResult(result)) {
    return '';
  }

  const content = result.content[0];
  if (!content || content.type !== 'text') {
    return '';
  }

  try {
    const parsed = JSON.parse(content.text);
    const error = parsed?.error;
    if (typeof error === 'string' && error.length > 0) {
      return error;
    }
    if (error && typeof error === 'object') {
      const {
        message,
        userMessage,
        detail,
        name,
      } = error as Record<string, unknown>;
      if (typeof message === 'string' && message.length > 0) return message;
      if (typeof userMessage === 'string' && userMessage.length > 0) return userMessage;
      if (typeof detail === 'string' && detail.length > 0) return detail;
      if (typeof name === 'string' && name.length > 0) return name;
    }
    return content.text;
  } catch {
    return content.text;
  }
}

/**
 * Parse JSON from tool result
 */
export function parseToolResult<T = any>(result: CallToolResult): T {
  validateToolResult(result);
  const content = result.content[0];
  console.warn('[parseToolResult] text', typeof content === 'object' ? content.type : content);
  if (!content || content.type !== 'text') {
    throw new Error('No text content in tool result');
  }

  const text = content.text;
  console.warn('[parseToolResult] raw', text);
  if (typeof text !== 'string') {
    throw new Error('Tool result text is not a string');
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown> | T;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if ('data' in record) {
        return parsed as T;
      }
      return { ...record, data: parsed } as T;
    }
    return parsed as T;
  } catch (error) {
    throw new Error(`Failed to parse tool result as JSON: ${error}`);
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Generate test data
 */
export const TestData = {
  /**
   * Generate a unique test account name
   */
  generateAccountName(): string {
    return `Test Account ${Date.now()}`;
  },

  /**
   * Generate a test transaction
   */
  generateTransaction(accountId: string, categoryId?: string) {
    return {
      account_id: accountId,
      category_id: categoryId,
      payee_name: `Test Payee ${Date.now()}`,
      amount: -5000, // $5.00 outflow
      memo: `Test transaction ${Date.now()}`,
      date: new Date().toISOString().split('T')[0], // Today's date
      cleared: 'uncleared' as const,
    };
  },

  /**
   * Generate test amounts in milliunits
   */
  generateAmount(dollars: number): number {
    return Math.round(dollars * 1000);
  },
};

/**
 * Test data cleanup utilities
 */
export class TestDataCleanup {
  private createdAccountIds: string[] = [];
  private createdTransactionIds: string[] = [];

  /**
   * Track created account for cleanup
   */
  trackAccount(accountId: string): void {
    this.createdAccountIds.push(accountId);
  }

  /**
   * Track created transaction for cleanup
   */
  trackTransaction(transactionId: string): void {
    this.createdTransactionIds.push(transactionId);
  }

  /**
   * Clean up all tracked test data
   */
  async cleanup(server: YNABMCPServer, budgetId: string): Promise<void> {
    // Clean up transactions first (they depend on accounts)
    for (const transactionId of this.createdTransactionIds) {
      try {
        await executeToolCall(server, 'ynab:delete_transaction', {
          budget_id: budgetId,
          transaction_id: transactionId,
        });
      } catch (error) {
        console.warn(`Failed to cleanup transaction ${transactionId}:`, error);
      }
    }

    // Note: YNAB API doesn't support deleting accounts via API
    // Accounts created during testing will need manual cleanup
    if (this.createdAccountIds.length > 0) {
      console.warn(
        `Created ${this.createdAccountIds.length} test accounts that need manual cleanup:`,
        this.createdAccountIds,
      );
    }

    this.createdAccountIds = [];
    this.createdTransactionIds = [];
  }
}

/**
 * Assertion helpers for YNAB data
 */
export const YNABAssertions = {
  /**
   * Assert budget structure
   */
  assertBudget(budget: any): void {
    expect(budget).toBeDefined();
    expect(typeof budget.id).toBe('string');
    expect(typeof budget.name).toBe('string');
    expect(typeof budget.last_modified_on).toBe('string');
  },

  /**
   * Assert account structure
   */
  assertAccount(account: any): void {
    expect(account).toBeDefined();
    expect(typeof account.id).toBe('string');
    expect(typeof account.name).toBe('string');
    expect(typeof account.type).toBe('string');
    expect(typeof account.on_budget).toBe('boolean');
    expect(typeof account.closed).toBe('boolean');
    expect(typeof account.balance).toBe('number');
  },

  /**
   * Assert transaction structure
   */
  assertTransaction(transaction: any): void {
    expect(transaction).toBeDefined();
    expect(typeof transaction.id).toBe('string');
    expect(typeof transaction.date).toBe('string');
    expect(typeof transaction.amount).toBe('number');
    expect(typeof transaction.account_id).toBe('string');
    expect(['cleared', 'uncleared', 'reconciled']).toContain(transaction.cleared);
  },

  /**
   * Assert category structure
   */
  assertCategory(category: any): void {
    expect(category).toBeDefined();
    expect(typeof category.id).toBe('string');
    expect(typeof category.name).toBe('string');
    expect(typeof category.category_group_id).toBe('string');
    expect(typeof category.budgeted).toBe('number');
    expect(typeof category.activity).toBe('number');
    expect(typeof category.balance).toBe('number');
  },

  /**
   * Assert payee structure
   */
  assertPayee(payee: any): void {
    expect(payee).toBeDefined();
    expect(typeof payee.id).toBe('string');
    expect(typeof payee.name).toBe('string');
  },
};
