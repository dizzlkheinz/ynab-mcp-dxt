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
  // Import the tool handlers directly for testing
  const ynabAPI = server.getYNABAPI();

  // Route to the appropriate tool handler based on tool name
  switch (toolName) {
    case 'ynab:list_budgets': {
      const { handleListBudgets } = await import('../tools/budgetTools.js');
      return await handleListBudgets(ynabAPI);
    }
    case 'ynab:get_budget': {
      const { handleGetBudget, GetBudgetSchema } = await import('../tools/budgetTools.js');
      const params = GetBudgetSchema.parse(args);
      return await handleGetBudget(ynabAPI, params);
    }
    case 'ynab:list_accounts': {
      const { handleListAccounts, ListAccountsSchema } = await import('../tools/accountTools.js');
      const params = ListAccountsSchema.parse(args);
      return await handleListAccounts(ynabAPI, params);
    }
    case 'ynab:get_account': {
      const { handleGetAccount, GetAccountSchema } = await import('../tools/accountTools.js');
      const params = GetAccountSchema.parse(args);
      return await handleGetAccount(ynabAPI, params);
    }
    case 'ynab:create_account': {
      const { handleCreateAccount, CreateAccountSchema } = await import('../tools/accountTools.js');
      const params = CreateAccountSchema.parse(args);
      return await handleCreateAccount(ynabAPI, params);
    }
    case 'ynab:list_transactions': {
      const { handleListTransactions, ListTransactionsSchema } = await import(
        '../tools/transactionTools.js'
      );
      const params = ListTransactionsSchema.parse(args);
      return await handleListTransactions(ynabAPI, params);
    }
    case 'ynab:get_transaction': {
      const { handleGetTransaction, GetTransactionSchema } = await import(
        '../tools/transactionTools.js'
      );
      const params = GetTransactionSchema.parse(args);
      return await handleGetTransaction(ynabAPI, params);
    }
    case 'ynab:create_transaction': {
      const { handleCreateTransaction, CreateTransactionSchema } = await import(
        '../tools/transactionTools.js'
      );
      const params = CreateTransactionSchema.parse(args);
      return await handleCreateTransaction(ynabAPI, params);
    }
    case 'ynab:update_transaction': {
      const { handleUpdateTransaction, UpdateTransactionSchema } = await import(
        '../tools/transactionTools.js'
      );
      const params = UpdateTransactionSchema.parse(args);
      return await handleUpdateTransaction(ynabAPI, params);
    }
    case 'ynab:delete_transaction': {
      const { handleDeleteTransaction, DeleteTransactionSchema } = await import(
        '../tools/transactionTools.js'
      );
      const params = DeleteTransactionSchema.parse(args);
      return await handleDeleteTransaction(ynabAPI, params);
    }
    case 'ynab:list_categories': {
      const { handleListCategories, ListCategoriesSchema } = await import(
        '../tools/categoryTools.js'
      );
      const params = ListCategoriesSchema.parse(args);
      return await handleListCategories(ynabAPI, params);
    }
    case 'ynab:get_category': {
      const { handleGetCategory, GetCategorySchema } = await import('../tools/categoryTools.js');
      const params = GetCategorySchema.parse(args);
      return await handleGetCategory(ynabAPI, params);
    }
    case 'ynab:update_category': {
      const { handleUpdateCategory, UpdateCategorySchema } = await import(
        '../tools/categoryTools.js'
      );
      const params = UpdateCategorySchema.parse(args);
      return await handleUpdateCategory(ynabAPI, params);
    }
    case 'ynab:list_payees': {
      const { handleListPayees, ListPayeesSchema } = await import('../tools/payeeTools.js');
      const params = ListPayeesSchema.parse(args);
      return await handleListPayees(ynabAPI, params);
    }
    case 'ynab:get_payee': {
      const { handleGetPayee, GetPayeeSchema } = await import('../tools/payeeTools.js');
      const params = GetPayeeSchema.parse(args);
      return await handleGetPayee(ynabAPI, params);
    }
    case 'ynab:get_month': {
      const { handleGetMonth, GetMonthSchema } = await import('../tools/monthTools.js');
      const params = GetMonthSchema.parse(args);
      return await handleGetMonth(ynabAPI, params);
    }
    case 'ynab:list_months': {
      const { handleListMonths, ListMonthsSchema } = await import('../tools/monthTools.js');
      const params = ListMonthsSchema.parse(args);
      return await handleListMonths(ynabAPI, params);
    }
    case 'ynab:get_user': {
      const { handleGetUser } = await import('../tools/utilityTools.js');
      return await handleGetUser(ynabAPI);
    }
    case 'ynab:convert_amount': {
      const { handleConvertAmount, ConvertAmountSchema } = await import('../tools/utilityTools.js');
      const params = ConvertAmountSchema.parse(args);
      return await handleConvertAmount(params);
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
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
 * Parse JSON from tool result
 */
export function parseToolResult<T = any>(result: CallToolResult): T {
  validateToolResult(result);
  const content = result.content[0];
  if (!content || content.type !== 'text') {
    throw new Error('No text content in tool result');
  }

  const text = content.text;
  if (typeof text !== 'string') {
    throw new Error('Tool result text is not a string');
  }

  try {
    return JSON.parse(text) as T;
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
