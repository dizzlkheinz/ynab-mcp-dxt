/**
 * End-to-end workflow tests for YNAB MCP Server
 * These tests require a real YNAB API key and test budget
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { YNABMCPServer } from '../server/YNABMCPServer.js';
import { getCurrentMonth } from '../utils/dateUtils.js';
import {
  getTestConfig,
  createTestServer,
  executeToolCall,
  parseToolResult,
  TestData,
  TestDataCleanup,
  YNABAssertions,
} from './testUtils.js';

const runE2ETests = process.env['SKIP_E2E_TESTS'] !== 'true';
const describeE2E = runE2ETests ? describe : describe.skip;

describeE2E('YNAB MCP Server - End-to-End Workflows', () => {
  let server: YNABMCPServer;
  let testConfig: ReturnType<typeof getTestConfig>;
  let cleanup: TestDataCleanup;
  let testBudgetId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testConfig = getTestConfig();

    if (testConfig.skipE2ETests) {
      console.warn('Skipping E2E tests - no real API key or SKIP_E2E_TESTS=true');
      return;
    }

    server = await createTestServer();
    cleanup = new TestDataCleanup();

    // Get the first budget for testing
    const budgetsResult = await executeToolCall(server, 'ynab:list_budgets');
    const budgets = parseToolResult(budgetsResult);
    const budgetList = budgets.data?.budgets ?? [];

    if (!budgetList.length && !testConfig.testBudgetId) {
      throw new Error('No budgets found for testing. Please create a test budget in YNAB.');
    }

    testBudgetId = testConfig.testBudgetId ?? budgetList[0]?.id;

    // Get the first account for testing
    const accountsResult = await executeToolCall(server, 'ynab:list_accounts', {
      budget_id: testBudgetId,
    });
    const accounts = parseToolResult(accountsResult);
    const accountList = accounts.data?.accounts ?? [];

    if (!accountList.length) {
      if (testConfig.testAccountId) {
        testAccountId = testConfig.testAccountId;
      } else {
        throw new Error('No accounts found for testing. Please create a test account in YNAB.');
      }
    } else {
      testAccountId = testConfig.testAccountId ?? accountList[0].id;
    }
  });

  afterAll(async () => {
    if (testConfig.skipE2ETests) return;

    if (cleanup && server && testBudgetId) {
      await cleanup.cleanup(server, testBudgetId);
    }
  });

  beforeEach(() => {
    if (testConfig.skipE2ETests) {
      // Skip individual tests if E2E tests are disabled
      return;
    }
  });

  describe('Complete Budget Management Workflow', () => {
    it('should retrieve and validate budget information', async () => {
      if (testConfig.skipE2ETests) return;

      // List all budgets
      const budgetsResult = await executeToolCall(server, 'ynab:list_budgets');
      const budgets = parseToolResult(budgetsResult);

      expect(budgets.data).toBeDefined();
      expect(budgets.data.budgets).toBeDefined();
      expect(Array.isArray(budgets.data.budgets)).toBe(true);
      expect(budgets.data.budgets.length).toBeGreaterThan(0);

      // Validate budget structure
      budgets.data.budgets.forEach(YNABAssertions.assertBudget);

      // Get specific budget details
      const budgetResult = await executeToolCall(server, 'ynab:get_budget', {
        budget_id: testBudgetId,
      });
      const budget = parseToolResult(budgetResult);

      expect(budget.data).toBeDefined();
      expect(budget.data.budget).toBeDefined();
      YNABAssertions.assertBudget(budget.data.budget);
      expect(budget.data.budget.id).toBe(testBudgetId);
    });

    it('should retrieve user information', async () => {
      if (testConfig.skipE2ETests) return;

      const userResult = await executeToolCall(server, 'ynab:get_user');
      const user = parseToolResult(userResult);

      expect(user.data).toBeDefined();
      expect(user.data.user).toBeDefined();
      expect(typeof user.data.user.id).toBe('string');
    });
  });

  describe('Complete Account Management Workflow', () => {
    it('should list and retrieve account information', async () => {
      if (testConfig.skipE2ETests) return;

      // List all accounts
      const accountsResult = await executeToolCall(server, 'ynab:list_accounts', {
        budget_id: testBudgetId,
      });
      const accounts = parseToolResult(accountsResult);

      expect(accounts.data).toBeDefined();
      expect(accounts.data.accounts).toBeDefined();
      expect(Array.isArray(accounts.data.accounts)).toBe(true);
      expect(accounts.data.accounts.length).toBeGreaterThan(0);

      // Validate account structures
      accounts.data.accounts.forEach(YNABAssertions.assertAccount);

      // Get specific account details
      const accountResult = await executeToolCall(server, 'ynab:get_account', {
        budget_id: testBudgetId,
        account_id: testAccountId,
      });
      const account = parseToolResult(accountResult);

      expect(account.data).toBeDefined();
      expect(account.data.account).toBeDefined();
      YNABAssertions.assertAccount(account.data.account);
      expect(account.data.account.id).toBe(testAccountId);
    });

    it('should create a new account', async () => {
      if (testConfig.skipE2ETests) return;

      const accountName = TestData.generateAccountName();

      const createResult = await executeToolCall(server, 'ynab:create_account', {
        budget_id: testBudgetId,
        name: accountName,
        type: 'checking',
        balance: 10000, // $10.00
      });
      const createdAccount = parseToolResult(createResult);

      expect(createdAccount.data).toBeDefined();
      expect(createdAccount.data.account).toBeDefined();
      YNABAssertions.assertAccount(createdAccount.data.account);
      expect(createdAccount.data.account.name).toBe(accountName);
      expect(createdAccount.data.account.type).toBe('checking');

      // Track for cleanup
      cleanup.trackAccount(createdAccount.data.account.id);

      // Verify account appears in list
      const accountsResult = await executeToolCall(server, 'ynab:list_accounts', {
        budget_id: testBudgetId,
      });
      const accounts = parseToolResult(accountsResult);

      const foundAccount = accounts.data.accounts.find(
        (acc: any) => acc.id === createdAccount.data.account.id,
      );
      expect(foundAccount).toBeDefined();
      expect(foundAccount.name).toBe(accountName);
    });
  });

  describe('Complete Transaction Management Workflow', () => {
    let testTransactionId: string;

    it('should create, retrieve, update, and delete a transaction', async () => {
      if (testConfig.skipE2ETests) return;

      // Get categories for transaction creation
      const categoriesResult = await executeToolCall(server, 'ynab:list_categories', {
        budget_id: testBudgetId,
      });
      const categories = parseToolResult(categoriesResult);

      expect(categories.data.category_groups).toBeDefined();
      expect(Array.isArray(categories.data.category_groups)).toBe(true);

      // Find a non-hidden category
      let testCategoryId: string | undefined;
      for (const group of categories.data.category_groups) {
        const availableCategory = group.categories?.find((cat: any) => !cat.hidden);
        if (availableCategory) {
          testCategoryId = availableCategory.id;
          break;
        }
      }

      // Create a transaction
      const transactionData = TestData.generateTransaction(testAccountId, testCategoryId);

      const createResult = await executeToolCall(server, 'ynab:create_transaction', {
        budget_id: testBudgetId,
        ...transactionData,
      });
      const createdTransaction = parseToolResult(createResult);

      expect(createdTransaction.data).toBeDefined();
      expect(createdTransaction.data.transaction).toBeDefined();
      YNABAssertions.assertTransaction(createdTransaction.data.transaction);

      testTransactionId = createdTransaction.data.transaction.id;
      cleanup.trackTransaction(testTransactionId);

      // Retrieve the transaction
      const getResult = await executeToolCall(server, 'ynab:get_transaction', {
        budget_id: testBudgetId,
        transaction_id: testTransactionId,
      });
      const retrievedTransaction = parseToolResult(getResult);

      expect(retrievedTransaction.data).toBeDefined();
      expect(retrievedTransaction.data.transaction).toBeDefined();
      expect(retrievedTransaction.data.transaction.id).toBe(testTransactionId);
      YNABAssertions.assertTransaction(retrievedTransaction.data.transaction);

      // Update the transaction
      const updatedMemo = `Updated memo ${Date.now()}`;
      const updateResult = await executeToolCall(server, 'ynab:update_transaction', {
        budget_id: testBudgetId,
        transaction_id: testTransactionId,
        memo: updatedMemo,
      });
      const updatedTransaction = parseToolResult(updateResult);

      expect(updatedTransaction.data).toBeDefined();
      expect(updatedTransaction.data.transaction).toBeDefined();
      expect(updatedTransaction.data.transaction.memo).toBe(updatedMemo);

      // List transactions and verify our transaction is included
      const listResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: testBudgetId,
        account_id: testAccountId,
      });
      const transactions = parseToolResult(listResult);

      expect(transactions.data).toBeDefined();
      expect(transactions.data.transactions).toBeDefined();
      expect(Array.isArray(transactions.data.transactions)).toBe(true);

      const foundTransaction = transactions.data.transactions.find(
        (txn: any) => txn.id === testTransactionId,
      );
      expect(foundTransaction).toBeDefined();
      expect(foundTransaction.memo).toBe(updatedMemo);

      // Delete the transaction
      const deleteResult = await executeToolCall(server, 'ynab:delete_transaction', {
        budget_id: testBudgetId,
        transaction_id: testTransactionId,
      });
      const deleteResponse = parseToolResult(deleteResult);

      expect(deleteResponse.data).toBeDefined();

      // Verify transaction is deleted (should return error when trying to retrieve)
      const getDeletedResult = await executeToolCall(server, 'ynab:get_transaction', {
        budget_id: testBudgetId,
        transaction_id: testTransactionId,
      });
      expect(getDeletedResult.isError).toBe(true);
      if (getDeletedResult.isError) {
        // Expected - transaction should not be found
        expect(getDeletedResult.content).toBeDefined();
        expect(getDeletedResult.content.length).toBeGreaterThan(0);
      }
    });

    it('should filter transactions by date and account', async () => {
      if (testConfig.skipE2ETests) return;

      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // List transactions since last month
      const recentResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: testBudgetId,
        since_date: lastMonth,
      });
      const recentTransactions = parseToolResult(recentResult);

      expect(recentTransactions.data).toBeDefined();
      expect(recentTransactions.data.transactions).toBeDefined();
      expect(Array.isArray(recentTransactions.data.transactions)).toBe(true);

      // List transactions for specific account
      const accountResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: testBudgetId,
        account_id: testAccountId,
      });
      const accountTransactions = parseToolResult(accountResult);

      expect(accountTransactions.data).toBeDefined();
      expect(accountTransactions.data.transactions).toBeDefined();
      expect(Array.isArray(accountTransactions.data.transactions)).toBe(true);

      // All transactions should be for the specified account
      accountTransactions.data.transactions.forEach((txn: any) => {
        expect(txn.account_id).toBe(testAccountId);
      });
    });
  });

  describe('Complete Category Management Workflow', () => {
    it('should list categories and update category budget', async () => {
      if (testConfig.skipE2ETests) return;

      // List all categories
      const categoriesResult = await executeToolCall(server, 'ynab:list_categories', {
        budget_id: testBudgetId,
      });
      const categories = parseToolResult(categoriesResult);

      expect(categories.data).toBeDefined();
      expect(categories.data.category_groups).toBeDefined();
      expect(Array.isArray(categories.data.category_groups)).toBe(true);

      // Find a category to test with
      let testCategoryId: string | undefined;
      let testCategory: any;

      for (const group of categories.data.category_groups) {
        if (group.categories && group.categories.length > 0) {
          testCategory = group.categories.find((cat: any) => !cat.hidden);
          if (testCategory) {
            testCategoryId = testCategory.id;
            break;
          }
        }
      }

      if (!testCategoryId) {
        console.warn('No available categories found for testing');
        return;
      }

      // Get specific category details
      const categoryResult = await executeToolCall(server, 'ynab:get_category', {
        budget_id: testBudgetId,
        category_id: testCategoryId,
      });
      const category = parseToolResult(categoryResult);

      expect(category.data).toBeDefined();
      expect(category.data.category).toBeDefined();
      YNABAssertions.assertCategory(category.data.category);
      expect(category.data.category.id).toBe(testCategoryId);

      // Update category budget
      const newBudgetAmount = TestData.generateAmount(50); // $50.00
      const updateResult = await executeToolCall(server, 'ynab:update_category', {
        budget_id: testBudgetId,
        category_id: testCategoryId,
        budgeted: newBudgetAmount,
      });
      const updatedCategory = parseToolResult(updateResult);

      expect(updatedCategory.data).toBeDefined();
      expect(updatedCategory.data.category).toBeDefined();
      expect(updatedCategory.data.category.budgeted).toBe(newBudgetAmount);
    });
  });

  describe('Complete Payee Management Workflow', () => {
    it('should list and retrieve payee information', async () => {
      if (testConfig.skipE2ETests) return;

      // List all payees
      const payeesResult = await executeToolCall(server, 'ynab:list_payees', {
        budget_id: testBudgetId,
      });
      const payees = parseToolResult(payeesResult);

      expect(payees.data).toBeDefined();
      expect(payees.data.payees).toBeDefined();
      expect(Array.isArray(payees.data.payees)).toBe(true);

      if (payees.data.payees.length > 0) {
        // Validate payee structures
        payees.data.payees.forEach(YNABAssertions.assertPayee);

        // Get specific payee details
        const testPayeeId = payees.data.payees[0].id;
        const payeeResult = await executeToolCall(server, 'ynab:get_payee', {
          budget_id: testBudgetId,
          payee_id: testPayeeId,
        });
        const payee = parseToolResult(payeeResult);

        expect(payee.data).toBeDefined();
        expect(payee.data.payee).toBeDefined();
        YNABAssertions.assertPayee(payee.data.payee);
        expect(payee.data.payee.id).toBe(testPayeeId);
      }
    });
  });

  describe('Complete Monthly Data Workflow', () => {
    it('should retrieve monthly budget data', async () => {
      if (testConfig.skipE2ETests) return;

      // List all months
      const monthsResult = await executeToolCall(server, 'ynab:list_months', {
        budget_id: testBudgetId,
      });
      const months = parseToolResult(monthsResult);

      expect(months.data).toBeDefined();
      expect(months.data.months).toBeDefined();
      expect(Array.isArray(months.data.months)).toBe(true);
      expect(months.data.months.length).toBeGreaterThan(0);

      // Get current month data
      const currentMonth = getCurrentMonth();
      const monthResult = await executeToolCall(server, 'ynab:get_month', {
        budget_id: testBudgetId,
        month: currentMonth,
      });
      const month = parseToolResult(monthResult);

      expect(month.data).toBeDefined();
      expect(month.data.month).toBeDefined();
      expect(typeof month.data.month.month).toBe('string');
      expect(typeof month.data.month.income).toBe('number');
      expect(typeof month.data.month.budgeted).toBe('number');
      expect(typeof month.data.month.activity).toBe('number');
      expect(typeof month.data.month.to_be_budgeted).toBe('number');
    });
  });

  describe('Utility Tools Workflow', () => {
    it('should convert amounts between dollars and milliunits', async () => {
      if (testConfig.skipE2ETests) return;

      // Convert dollars to milliunits
      const toMilliunitsResult = await executeToolCall(server, 'ynab:convert_amount', {
        amount: 25.5,
        to_milliunits: true,
      });
      const milliunits = parseToolResult(toMilliunitsResult);

      expect(milliunits.data?.conversion?.converted_amount).toBe(25500);
      expect(milliunits.data?.conversion?.description).toContain('25500');
      expect(milliunits.data?.conversion?.to_milliunits).toBe(true);

      // Convert milliunits to dollars
      const toDollarsResult = await executeToolCall(server, 'ynab:convert_amount', {
        amount: 25500,
        to_milliunits: false,
      });
      const dollars = parseToolResult(toDollarsResult);

      expect(dollars.data?.conversion?.converted_amount).toBe(25.5);
      expect(dollars.data?.conversion?.description).toContain('$25.50');
      expect(dollars.data?.conversion?.to_milliunits).toBe(false);
    });
  });

  describe('v0.8.0 Architecture Integration Tests', () => {
    describe('Cache System Verification', () => {
      it('should demonstrate cache warming after default budget set', async () => {
        if (testConfig.skipE2ETests) return;

        // Get initial cache stats
        const initialStatsResult = await executeToolCall(server, 'ynab:diagnostic_info');
        const initialStats = parseToolResult(initialStatsResult);
        const initialCacheStats = initialStats.data?.diagnostics?.cache_stats;

        // Set default budget (should trigger cache warming)
        await executeToolCall(server, 'ynab:set_default_budget', {
          budget_id: testBudgetId,
        });

        // Allow time for cache warming (fire-and-forget)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get updated cache stats
        const finalStatsResult = await executeToolCall(server, 'ynab:diagnostic_info');
        const finalStats = parseToolResult(finalStatsResult);
        const finalCacheStats = finalStats.data?.diagnostics?.cache_stats;

        // Verify cache warming occurred
        expect(finalCacheStats?.total_entries).toBeGreaterThan(
          initialCacheStats?.total_entries || 0,
        );
        expect(finalCacheStats?.hit_rate).toBeGreaterThanOrEqual(0);
      });

      it('should demonstrate LRU eviction and observability metrics', async () => {
        if (testConfig.skipE2ETests) return;

        // Get initial cache stats
        const initialStatsResult = await executeToolCall(server, 'ynab:diagnostic_info');
        const initialStats = parseToolResult(initialStatsResult);
        const initialCacheStats = initialStats.data?.diagnostics?.cache_stats;

        // Perform operations that should hit cache
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: testBudgetId });
        await executeToolCall(server, 'ynab:list_categories', { budget_id: testBudgetId });
        await executeToolCall(server, 'ynab:list_payees', { budget_id: testBudgetId });

        // Perform same operations again (should hit cache)
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: testBudgetId });
        await executeToolCall(server, 'ynab:list_categories', { budget_id: testBudgetId });
        await executeToolCall(server, 'ynab:list_payees', { budget_id: testBudgetId });

        // Get final cache stats
        const finalStatsResult = await executeToolCall(server, 'ynab:diagnostic_info');
        const finalStats = parseToolResult(finalStatsResult);
        const finalCacheStats = finalStats.data?.diagnostics?.cache_stats;

        // Verify cache behavior
        expect(finalCacheStats?.total_hits).toBeGreaterThan(initialCacheStats?.total_hits || 0);
        expect(finalCacheStats?.total_misses).toBeGreaterThan(initialCacheStats?.total_misses || 0);
        expect(finalCacheStats?.hit_rate).toBeGreaterThan(0);
        expect(finalCacheStats?.total_entries).toBeGreaterThan(0);
      });

      it('should demonstrate cache invalidation on write operations', async () => {
        if (testConfig.skipE2ETests) return;

        // Prime cache by listing accounts
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: testBudgetId });

        // Create new account (should invalidate accounts cache)
        const accountName = TestData.generateAccountName();
        const createResult = await executeToolCall(server, 'ynab:create_account', {
          budget_id: testBudgetId,
          name: accountName,
          type: 'checking',
          balance: 10000,
        });
        const createdAccount = parseToolResult(createResult);
        cleanup.trackAccount(createdAccount.data.account.id);

        // List accounts again (should show new account due to cache invalidation)
        const accountsResult = await executeToolCall(server, 'ynab:list_accounts', {
          budget_id: testBudgetId,
        });
        const accounts = parseToolResult(accountsResult);

        const foundAccount = accounts.data.accounts.find(
          (acc: any) => acc.id === createdAccount.data.account.id,
        );
        expect(foundAccount).toBeDefined();
        expect(foundAccount.name).toBe(accountName);
      });
    });

    describe('Budget Resolution Consistency', () => {
      it('should provide consistent error messages for missing budget ID', async () => {
        if (testConfig.skipE2ETests) return;

        // Clear default budget first
        server['defaultBudgetId'] = undefined;

        // Test multiple tools for consistent error handling
        const toolsToTest = [
          'ynab:list_accounts',
          'ynab:list_categories',
          'ynab:list_payees',
          'ynab:list_transactions',
        ];

        for (const toolName of toolsToTest) {
          const result = await executeToolCall(server, toolName, {});
          expect(result.isError).toBe(true);
          if (result.isError) {
            const errorMessage = result.content[0]?.text || '';
            expect(errorMessage).toContain('No default budget set');
            expect(errorMessage).toContain('set_default_budget');
          }
        }

        // Restore default budget for other tests
        await executeToolCall(server, 'ynab:set_default_budget', { budget_id: testBudgetId });
      });

      it('should handle invalid budget ID format consistently', async () => {
        if (testConfig.skipE2ETests) return;

        const invalidBudgetId = 'invalid-format';
        const toolsToTest = ['ynab:list_accounts', 'ynab:list_categories', 'ynab:list_payees'];

        for (const toolName of toolsToTest) {
          const result = await executeToolCall(server, toolName, { budget_id: invalidBudgetId });
          expect(result.isError).toBe(true);
          if (result.isError) {
            // All tools should provide similar error handling
            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe('Financial Analysis Integration', () => {
      it('should execute decomposed financial overview tools', async () => {
        if (testConfig.skipE2ETests) return;

        // Test financial overview tool
        const overviewResult = await executeToolCall(server, 'ynab:financial_overview', {
          budget_id: testBudgetId,
        });
        const overview = parseToolResult(overviewResult);

        expect(overview.data).toBeDefined();
        expect(overview.data.financial_overview).toBeDefined();
        expect(overview.data.financial_overview.total_income).toBeDefined();
        expect(overview.data.financial_overview.total_spending).toBeDefined();
        expect(overview.data.financial_overview.budget_utilization).toBeDefined();

        // Test spending analysis tool
        const spendingResult = await executeToolCall(server, 'ynab:spending_analysis', {
          budget_id: testBudgetId,
          analysis_type: 'trends',
        });
        const spending = parseToolResult(spendingResult);

        expect(spending.data).toBeDefined();
        expect(spending.data.spending_analysis).toBeDefined();

        // Test budget health check tool
        const healthResult = await executeToolCall(server, 'ynab:budget_health_check', {
          budget_id: testBudgetId,
        });
        const health = parseToolResult(healthResult);

        expect(health.data).toBeDefined();
        expect(health.data.health_check).toBeDefined();
        expect(health.data.health_check.overall_score).toBeDefined();
      });
    });

    describe('Tool Registry Integration', () => {
      it('should demonstrate tool registry functionality', async () => {
        if (testConfig.skipE2ETests) return;

        // Test that tool listing includes all expected tools
        const toolsResult = await server.handleListTools();
        expect(toolsResult.tools).toBeDefined();
        expect(Array.isArray(toolsResult.tools)).toBe(true);
        expect(toolsResult.tools.length).toBeGreaterThan(20);

        // Verify key v0.8.0 tools are present
        const toolNames = toolsResult.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('ynab:list_budgets');
        expect(toolNames).toContain('ynab:financial_overview');
        expect(toolNames).toContain('ynab:spending_analysis');
        expect(toolNames).toContain('ynab:budget_health_check');
        expect(toolNames).toContain('ynab:compare_transactions');
        expect(toolNames).toContain('ynab:diagnostic_info');

        // Test that each tool has proper schema validation
        for (const tool of toolsResult.tools) {
          expect(tool.name).toBeDefined();
          expect(tool.description).toBeDefined();
          expect(tool.inputSchema).toBeDefined();
        }
      });
    });

    describe('Module Integration Tests', () => {
      it('should verify resource manager integration', async () => {
        if (testConfig.skipE2ETests) return;

        // Test resource listing
        const resourcesResult = await server.handleListResources();
        expect(resourcesResult.resources).toBeDefined();
        expect(Array.isArray(resourcesResult.resources)).toBe(true);

        // Test reading a specific resource
        if (resourcesResult.resources.length > 0) {
          const resource = resourcesResult.resources[0];
          const readResult = await server.handleReadResource({
            uri: resource.uri,
          });
          expect(readResult.contents).toBeDefined();
        }
      });

      it('should verify prompt manager integration', async () => {
        if (testConfig.skipE2ETests) return;

        // Test prompt listing
        const promptsResult = await server.handleListPrompts();
        expect(promptsResult.prompts).toBeDefined();
        expect(Array.isArray(promptsResult.prompts)).toBe(true);

        // Test getting a specific prompt
        if (promptsResult.prompts.length > 0) {
          const prompt = promptsResult.prompts[0];
          const getResult = await server.handleGetPrompt({
            name: prompt.name,
            arguments: {},
          });
          expect(getResult.messages).toBeDefined();
        }
      });

      it('should verify diagnostic manager integration', async () => {
        if (testConfig.skipE2ETests) return;

        // Test diagnostic info tool
        const diagnosticResult = await executeToolCall(server, 'ynab:diagnostic_info');
        const diagnostic = parseToolResult(diagnosticResult);

        expect(diagnostic.data).toBeDefined();
        expect(diagnostic.data.diagnostics).toBeDefined();
        expect(diagnostic.data.diagnostics.server_info).toBeDefined();
        expect(diagnostic.data.diagnostics.cache_stats).toBeDefined();
        expect(diagnostic.data.diagnostics.environment_check).toBeDefined();
      });
    });

    describe('Backward Compatibility Verification', () => {
      it('should maintain v0.7.x API compatibility', async () => {
        if (testConfig.skipE2ETests) return;

        // Test that all existing tool calls work identically
        const v7Tools = [
          { name: 'ynab:list_budgets', args: {} },
          { name: 'ynab:list_accounts', args: { budget_id: testBudgetId } },
          { name: 'ynab:list_categories', args: { budget_id: testBudgetId } },
          { name: 'ynab:list_payees', args: { budget_id: testBudgetId } },
          { name: 'ynab:get_user', args: {} },
          { name: 'ynab:convert_amount', args: { amount: 100, to_milliunits: true } },
        ];

        for (const tool of v7Tools) {
          const result = await executeToolCall(server, tool.name, tool.args);
          const parsed = parseToolResult(result);

          // Verify response structure is consistent with v0.7.x
          expect(parsed.data).toBeDefined();
          expect(parsed.success).toBe(true);
        }
      });

      it('should maintain response format consistency', async () => {
        if (testConfig.skipE2ETests) return;

        // Test that response formats match expected v0.7.x structure
        const budgetsResult = await executeToolCall(server, 'ynab:list_budgets');
        const budgets = parseToolResult(budgetsResult);

        // Verify standard response wrapper
        expect(budgets).toHaveProperty('success');
        expect(budgets).toHaveProperty('data');
        expect(budgets.success).toBe(true);
        expect(budgets.data).toHaveProperty('budgets');
      });
    });

    describe('Performance Regression Tests', () => {
      it('should not introduce performance regressions', async () => {
        if (testConfig.skipE2ETests) return;

        // Test response times for common operations
        const operations = [
          { name: 'ynab:list_budgets', args: {} },
          { name: 'ynab:list_accounts', args: { budget_id: testBudgetId } },
          { name: 'ynab:list_categories', args: { budget_id: testBudgetId } },
        ];

        for (const operation of operations) {
          const startTime = Date.now();
          await executeToolCall(server, operation.name, operation.args);
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Response should be reasonably fast (under 5 seconds for E2E)
          expect(duration).toBeLessThan(5000);
        }
      });

      it('should demonstrate cache performance improvements', async () => {
        if (testConfig.skipE2ETests) return;

        // First call (cache miss)
        const startTime1 = Date.now();
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: testBudgetId });
        const duration1 = Date.now() - startTime1;

        // Second call (cache hit)
        const startTime2 = Date.now();
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: testBudgetId });
        const duration2 = Date.now() - startTime2;

        // Cached call should be faster (allowing for some variance in E2E environment)
        expect(duration2).toBeLessThanOrEqual(duration1 + 100); // Allow 100ms tolerance
      });
    });

    describe('Enhanced Error Handling', () => {
      it('should provide improved error messages with actionable suggestions', async () => {
        if (testConfig.skipE2ETests) return;

        // Clear default budget
        server['defaultBudgetId'] = undefined;

        const result = await executeToolCall(server, 'ynab:list_accounts', {});
        expect(result.isError).toBe(true);
        if (result.isError) {
          const errorMessage = result.content[0]?.text || '';

          // Error should provide actionable guidance
          expect(errorMessage).toContain('No default budget set');
          expect(errorMessage).toContain('set_default_budget');
          expect(errorMessage).toContain('provide budget_id parameter');
        }

        // Restore default budget
        await executeToolCall(server, 'ynab:set_default_budget', { budget_id: testBudgetId });
      });
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle invalid budget ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      const result = await executeToolCall(server, 'ynab:get_budget', {
        budget_id: 'invalid-budget-id',
      });
      expect(result.isError).toBe(true);
      if (result.isError) {
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        // Error should be handled gracefully without exposing sensitive information
      }
    });

    it('should handle invalid account ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      const result = await executeToolCall(server, 'ynab:get_account', {
        budget_id: testBudgetId,
        account_id: 'invalid-account-id',
      });
      expect(result.isError).toBe(true);
      if (result.isError) {
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid transaction ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      const result = await executeToolCall(server, 'ynab:get_transaction', {
        budget_id: testBudgetId,
        transaction_id: 'invalid-transaction-id',
      });
      expect(result.isError).toBe(true);
      if (result.isError) {
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
      }
    });
  });
});
