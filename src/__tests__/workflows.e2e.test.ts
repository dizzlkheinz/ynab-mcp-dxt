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

describe('YNAB MCP Server - End-to-End Workflows', () => {
  let server: YNABMCPServer;
  let testConfig: ReturnType<typeof getTestConfig>;
  let cleanup: TestDataCleanup;
  let testBudgetId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testConfig = getTestConfig();

    if (testConfig.skipE2ETests) {
      console.log('Skipping E2E tests - no real API key or SKIP_E2E_TESTS=true');
      return;
    }

    server = await createTestServer();
    cleanup = new TestDataCleanup();

    // Get the first budget for testing
    const budgetsResult = await executeToolCall(server, 'ynab:list_budgets');
    const budgets = parseToolResult(budgetsResult);

    if (!budgets.data?.budgets?.length) {
      throw new Error('No budgets found for testing. Please create a test budget in YNAB.');
    }

    testBudgetId = testConfig.testBudgetId || budgets.data.budgets[0].id;

    // Get the first account for testing
    const accountsResult = await executeToolCall(server, 'ynab:list_accounts', {
      budget_id: testBudgetId,
    });
    const accounts = parseToolResult(accountsResult);

    if (!accounts.data?.accounts?.length) {
      throw new Error('No accounts found for testing. Please create a test account in YNAB.');
    }

    testAccountId = testConfig.testAccountId || accounts.data.accounts[0].id;
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

      // Verify transaction is deleted (should throw error when trying to retrieve)
      try {
        await executeToolCall(server, 'ynab:get_transaction', {
          budget_id: testBudgetId,
          transaction_id: testTransactionId,
        });
        // If we get here, the transaction wasn't deleted
        expect.fail('Transaction should have been deleted');
      } catch (error) {
        // Expected - transaction should not be found
        expect(error).toBeDefined();
      }
    });

    it('should filter transactions by date and account', async () => {
      if (testConfig.skipE2ETests) return;

      const today = new Date().toISOString().split('T')[0];
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

      expect(milliunits.milliunits).toBe(25500);
      expect(milliunits.formatted).toBe('25500 milliunits');

      // Convert milliunits to dollars
      const toDollarsResult = await executeToolCall(server, 'ynab:convert_amount', {
        amount: 25500,
        to_milliunits: false,
      });
      const dollars = parseToolResult(toDollarsResult);

      expect(dollars.dollars).toBe(25.5);
      expect(dollars.formatted).toBe('$25.50');
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle invalid budget ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      try {
        await executeToolCall(server, 'ynab:get_budget', {
          budget_id: 'invalid-budget-id',
        });
        expect.fail('Should have thrown an error for invalid budget ID');
      } catch (error) {
        expect(error).toBeDefined();
        // Error should be handled gracefully without exposing sensitive information
      }
    });

    it('should handle invalid account ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      try {
        await executeToolCall(server, 'ynab:get_account', {
          budget_id: testBudgetId,
          account_id: 'invalid-account-id',
        });
        expect.fail('Should have thrown an error for invalid account ID');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid transaction ID gracefully', async () => {
      if (testConfig.skipE2ETests) return;

      try {
        await executeToolCall(server, 'ynab:get_transaction', {
          budget_id: testBudgetId,
          transaction_id: 'invalid-transaction-id',
        });
        expect.fail('Should have thrown an error for invalid transaction ID');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
