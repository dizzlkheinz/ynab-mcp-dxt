/**
 * Comprehensive integration tests for YNAB MCP Server
 * These tests use mocked YNAB API responses to test complete workflows
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { YNABMCPServer } from '../server/YNABMCPServer.js';
import { executeToolCall, parseToolResult, validateToolResult } from './testUtils.js';

// Mock the YNAB SDK
vi.mock('ynab', () => {
  const mockAPI = {
    budgets: {
      getBudgets: vi.fn(),
      getBudgetById: vi.fn(),
    },
    accounts: {
      getAccounts: vi.fn(),
      getAccountById: vi.fn(),
      createAccount: vi.fn(),
    },
    transactions: {
      getTransactions: vi.fn(),
      getTransactionsByAccount: vi.fn(),
      getTransactionsByCategory: vi.fn(),
      getTransactionById: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    },
    categories: {
      getCategories: vi.fn(),
      getCategoryById: vi.fn(),
      updateMonthCategory: vi.fn(),
    },
    payees: {
      getPayees: vi.fn(),
      getPayeeById: vi.fn(),
    },
    months: {
      getBudgetMonth: vi.fn(),
      getBudgetMonths: vi.fn(),
    },
    user: {
      getUser: vi.fn(),
    },
  };

  return {
    API: vi.fn(() => mockAPI),
    utils: {
      convertMilliUnitsToCurrencyAmount: vi.fn((milliunits: number) => milliunits / 1000),
      convertCurrencyAmountToMilliUnits: vi.fn((amount: number) => Math.round(amount * 1000)),
    },
  };
});

describe('YNAB MCP Server - Comprehensive Integration Tests', () => {
  let server: YNABMCPServer;
  let mockYnabAPI: any;

  beforeEach(async () => {
    // Set up environment
    process.env['YNAB_ACCESS_TOKEN'] = 'test-token';

    // Create server instance
    server = new YNABMCPServer();

    // Get the mocked YNAB API instance
    const { API } = await import('ynab');
    mockYnabAPI = new (API as any)();

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Complete Budget Management Integration', () => {
    it('should handle complete budget listing and retrieval workflow', async () => {
      // Mock budget list response
      const mockBudgets = {
        data: {
          budgets: [
            {
              id: 'budget-1',
              name: 'Test Budget 1',
              last_modified_on: '2024-01-01T00:00:00Z',
              first_month: '2024-01-01',
              last_month: '2024-12-01',
              date_format: { format: 'MM/DD/YYYY' },
              currency_format: { iso_code: 'USD', example_format: '$123.45' },
            },
            {
              id: 'budget-2',
              name: 'Test Budget 2',
              last_modified_on: '2024-01-02T00:00:00Z',
              first_month: '2024-01-01',
              last_month: '2024-12-01',
              date_format: { format: 'MM/DD/YYYY' },
              currency_format: { iso_code: 'USD', example_format: '$123.45' },
            },
          ],
        },
      };

      mockYnabAPI.budgets.getBudgets.mockResolvedValue(mockBudgets);

      // Test budget listing
      const listResult = await executeToolCall(server, 'ynab:list_budgets');
      validateToolResult(listResult);

      const budgets = parseToolResult(listResult);
      expect(budgets.budgets).toHaveLength(2);
      expect(budgets.budgets[0].name).toBe('Test Budget 1');
      expect(budgets.budgets[1].name).toBe('Test Budget 2');

      // Mock specific budget response
      const mockBudget = {
        data: {
          budget: {
            id: 'budget-1',
            name: 'Test Budget 1',
            last_modified_on: '2024-01-01T00:00:00Z',
            first_month: '2024-01-01',
            last_month: '2024-12-01',
            date_format: { format: 'MM/DD/YYYY' },
            currency_format: { iso_code: 'USD', example_format: '$123.45' },
            accounts: [],
            payees: [],
            category_groups: [],
            months: [],
          },
        },
      };

      mockYnabAPI.budgets.getBudgetById.mockResolvedValue(mockBudget);

      // Test specific budget retrieval
      const getResult = await executeToolCall(server, 'ynab:get_budget', {
        budget_id: 'budget-1',
      });
      validateToolResult(getResult);

      const budget = parseToolResult(getResult);
      expect(budget.budget.id).toBe('budget-1');
      expect(budget.budget.name).toBe('Test Budget 1');

      // Verify API calls
      expect(mockYnabAPI.budgets.getBudgets).toHaveBeenCalledTimes(1);
      expect(mockYnabAPI.budgets.getBudgetById).toHaveBeenCalledWith('budget-1');
    });

    it('should handle budget retrieval errors gracefully', async () => {
      // Mock API error
      const apiError = new Error('Budget not found');
      (apiError as any).error = { id: '404.2', name: 'not_found', description: 'Budget not found' };
      mockYnabAPI.budgets.getBudgetById.mockRejectedValue(apiError);

      // Test error handling
      try {
        await executeToolCall(server, 'ynab:get_budget', {
          budget_id: 'invalid-budget',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(mockYnabAPI.budgets.getBudgetById).toHaveBeenCalledWith('invalid-budget');
    });
  });

  describe('Complete Account Management Integration', () => {
    it('should handle complete account workflow', async () => {
      const budgetId = 'test-budget';

      // Mock accounts list
      const mockAccounts = {
        data: {
          accounts: [
            {
              id: 'account-1',
              name: 'Checking Account',
              type: 'checking',
              on_budget: true,
              closed: false,
              note: null,
              balance: 100000, // $100.00
              cleared_balance: 95000,
              uncleared_balance: 5000,
            },
            {
              id: 'account-2',
              name: 'Savings Account',
              type: 'savings',
              on_budget: true,
              closed: false,
              note: 'Emergency fund',
              balance: 500000, // $500.00
              cleared_balance: 500000,
              uncleared_balance: 0,
            },
          ],
        },
      };

      mockYnabAPI.accounts.getAccounts.mockResolvedValue(mockAccounts);

      // Test account listing
      const listResult = await executeToolCall(server, 'ynab:list_accounts', {
        budget_id: budgetId,
      });
      validateToolResult(listResult);

      const accounts = parseToolResult(listResult);
      expect(accounts.accounts).toHaveLength(2);
      expect(accounts.accounts[0].name).toBe('Checking Account');
      expect(accounts.accounts[1].name).toBe('Savings Account');

      // Mock specific account response
      const mockAccount = {
        data: {
          account: mockAccounts.data.accounts[0],
        },
      };

      mockYnabAPI.accounts.getAccountById.mockResolvedValue(mockAccount);

      // Test specific account retrieval
      const getResult = await executeToolCall(server, 'ynab:get_account', {
        budget_id: budgetId,
        account_id: 'account-1',
      });
      validateToolResult(getResult);

      const account = parseToolResult(getResult);
      expect(account.account.id).toBe('account-1');
      expect(account.account.name).toBe('Checking Account');
      expect(account.account.balance).toBe(100000);

      // Mock account creation
      const newAccount = {
        id: 'account-3',
        name: 'New Test Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: null,
        balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
      };

      const mockCreateResponse = {
        data: {
          account: newAccount,
        },
      };

      mockYnabAPI.accounts.createAccount.mockResolvedValue(mockCreateResponse);

      // Test account creation
      const createResult = await executeToolCall(server, 'ynab:create_account', {
        budget_id: budgetId,
        name: 'New Test Account',
        type: 'checking',
        balance: 0,
      });
      validateToolResult(createResult);

      const createdAccount = parseToolResult(createResult);
      expect(createdAccount.account.name).toBe('New Test Account');
      expect(createdAccount.account.type).toBe('checking');

      // Verify API calls
      expect(mockYnabAPI.accounts.getAccounts).toHaveBeenCalledWith(budgetId);
      expect(mockYnabAPI.accounts.getAccountById).toHaveBeenCalledWith(budgetId, 'account-1');
      expect(mockYnabAPI.accounts.createAccount).toHaveBeenCalledWith(budgetId, {
        account: {
          name: 'New Test Account',
          type: 'checking',
          balance: 0,
        },
      });
    });
  });

  describe('Complete Transaction Management Integration', () => {
    it('should handle complete transaction workflow', async () => {
      const budgetId = 'test-budget';
      const accountId = 'test-account';
      const transactionId = 'test-transaction';

      // Mock transactions list
      const mockTransactions = {
        data: {
          transactions: [
            {
              id: 'transaction-1',
              date: '2024-01-15',
              amount: -5000, // $5.00 outflow
              memo: 'Coffee shop',
              cleared: 'cleared',
              approved: true,
              flag_color: null,
              account_id: accountId,
              payee_id: 'payee-1',
              category_id: 'category-1',
              transfer_account_id: null,
            },
            {
              id: 'transaction-2',
              date: '2024-01-16',
              amount: 100000, // $100.00 inflow
              memo: 'Salary',
              cleared: 'cleared',
              approved: true,
              flag_color: null,
              account_id: accountId,
              payee_id: 'payee-2',
              category_id: null,
              transfer_account_id: null,
            },
          ],
        },
      };

      mockYnabAPI.transactions.getTransactionsByAccount.mockResolvedValue(mockTransactions);

      // Test transaction listing
      const listResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: budgetId,
        account_id: accountId,
      });
      validateToolResult(listResult);

      const transactions = parseToolResult(listResult);
      expect(transactions.transactions).toHaveLength(2);
      expect(transactions.transactions[0].memo).toBe('Coffee shop');
      expect(transactions.transactions[1].memo).toBe('Salary');

      // Mock specific transaction response
      const mockTransaction = {
        data: {
          transaction: mockTransactions.data.transactions[0],
        },
      };

      mockYnabAPI.transactions.getTransactionById.mockResolvedValue(mockTransaction);

      // Test specific transaction retrieval
      const getResult = await executeToolCall(server, 'ynab:get_transaction', {
        budget_id: budgetId,
        transaction_id: 'transaction-1',
      });
      validateToolResult(getResult);

      const transaction = parseToolResult(getResult);
      expect(transaction.transaction.id).toBe('transaction-1');
      expect(transaction.transaction.memo).toBe('Coffee shop');
      expect(transaction.transaction.amount).toBe(-5000);

      // Mock transaction creation
      const newTransaction = {
        id: 'transaction-3',
        date: '2024-01-17',
        amount: -2500,
        memo: 'Test transaction',
        cleared: 'uncleared',
        approved: true,
        flag_color: null,
        account_id: accountId,
        payee_id: null,
        category_id: 'category-1',
        transfer_account_id: null,
      };

      const mockCreateResponse = {
        data: {
          transaction: newTransaction,
        },
      };

      mockYnabAPI.transactions.createTransaction.mockResolvedValue(mockCreateResponse);

      // Test transaction creation
      const createResult = await executeToolCall(server, 'ynab:create_transaction', {
        budget_id: budgetId,
        account_id: accountId,
        category_id: 'category-1',
        payee_name: 'Test Payee',
        amount: -2500,
        memo: 'Test transaction',
        date: '2024-01-17',
        cleared: 'uncleared',
      });
      validateToolResult(createResult);

      const createdTransaction = parseToolResult(createResult);
      expect(createdTransaction.transaction.memo).toBe('Test transaction');
      expect(createdTransaction.transaction.amount).toBe(-2500);

      // Mock transaction update
      const updatedTransaction = { ...newTransaction, memo: 'Updated memo' };
      const mockUpdateResponse = {
        data: {
          transaction: updatedTransaction,
        },
      };

      mockYnabAPI.transactions.updateTransaction.mockResolvedValue(mockUpdateResponse);

      // Test transaction update
      const updateResult = await executeToolCall(server, 'ynab:update_transaction', {
        budget_id: budgetId,
        transaction_id: 'transaction-3',
        memo: 'Updated memo',
      });
      validateToolResult(updateResult);

      const updated = parseToolResult(updateResult);
      expect(updated.transaction.memo).toBe('Updated memo');

      // Mock transaction deletion
      mockYnabAPI.transactions.deleteTransaction.mockResolvedValue({
        data: {
          transaction: { ...updatedTransaction, deleted: true },
        },
      });

      // Test transaction deletion
      const deleteResult = await executeToolCall(server, 'ynab:delete_transaction', {
        budget_id: budgetId,
        transaction_id: 'transaction-3',
      });
      validateToolResult(deleteResult);

      // Verify API calls
      expect(mockYnabAPI.transactions.getTransactionsByAccount).toHaveBeenCalledWith(
        budgetId,
        accountId,
        undefined,
      );
      expect(mockYnabAPI.transactions.getTransactionById).toHaveBeenCalledWith(
        budgetId,
        'transaction-1',
      );
      expect(mockYnabAPI.transactions.createTransaction).toHaveBeenCalled();
      expect(mockYnabAPI.transactions.updateTransaction).toHaveBeenCalled();
      expect(mockYnabAPI.transactions.deleteTransaction).toHaveBeenCalledWith(
        budgetId,
        'transaction-3',
      );
    });

    it('should handle transaction filtering', async () => {
      const budgetId = 'test-budget';

      // Mock filtered transactions
      mockYnabAPI.transactions.getTransactions.mockResolvedValue({
        data: {
          transactions: [
            {
              id: 'filtered-transaction',
              date: '2024-01-15',
              amount: -1000,
              memo: 'Filtered transaction',
              cleared: 'cleared',
              approved: true,
              account_id: 'account-1',
              category_id: 'category-1',
            },
          ],
        },
      });

      // Test filtering by date
      const dateFilterResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: budgetId,
        since_date: '2024-01-01',
      });
      validateToolResult(dateFilterResult);

      // Also mock account/category specific endpoints
      mockYnabAPI.transactions.getTransactionsByAccount.mockResolvedValue({
        data: {
          transactions: [
            {
              id: 'filtered-transaction',
              date: '2024-01-15',
              amount: -1000,
              memo: 'Filtered transaction',
              cleared: 'cleared',
              approved: true,
              account_id: 'account-1',
              category_id: 'category-1',
            },
          ],
        },
      });
      mockYnabAPI.transactions.getTransactionsByCategory.mockResolvedValue({
        data: {
          transactions: [
            {
              id: 'filtered-transaction',
              date: '2024-01-15',
              amount: -1000,
              memo: 'Filtered transaction',
              cleared: 'cleared',
              approved: true,
              account_id: 'account-1',
              category_id: 'category-1',
            },
          ],
        },
      });

      // Test filtering by account
      const accountFilterResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: budgetId,
        account_id: 'account-1',
      });
      validateToolResult(accountFilterResult);

      // Test filtering by category
      const categoryFilterResult = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: budgetId,
        category_id: 'category-1',
      });
      validateToolResult(categoryFilterResult);

      // Verify API calls with different parameters
      expect(mockYnabAPI.transactions.getTransactions).toHaveBeenCalledTimes(1);
      expect(mockYnabAPI.transactions.getTransactionsByAccount).toHaveBeenCalledTimes(1);
      expect(mockYnabAPI.transactions.getTransactionsByCategory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Complete Category Management Integration', () => {
    it('should handle complete category workflow', async () => {
      const budgetId = 'test-budget';

      // Mock categories response
      const mockCategories = {
        data: {
          category_groups: [
            {
              id: 'group-1',
              name: 'Immediate Obligations',
              hidden: false,
              categories: [
                {
                  id: 'category-1',
                  category_group_id: 'group-1',
                  name: 'Rent/Mortgage',
                  hidden: false,
                  budgeted: 150000, // $150.00
                  activity: -150000,
                  balance: 0,
                  goal_type: null,
                },
                {
                  id: 'category-2',
                  category_group_id: 'group-1',
                  name: 'Utilities',
                  hidden: false,
                  budgeted: 10000, // $10.00
                  activity: -8500,
                  balance: 1500,
                  goal_type: null,
                },
              ],
            },
          ],
        },
      };

      mockYnabAPI.categories.getCategories.mockResolvedValue(mockCategories);

      // Test category listing
      const listResult = await executeToolCall(server, 'ynab:list_categories', {
        budget_id: budgetId,
      });
      validateToolResult(listResult);

      const categories = parseToolResult(listResult);
      expect(categories.category_groups).toHaveLength(1);
      expect(categories.categories).toHaveLength(2);
      expect(categories.categories[0].name).toBe('Rent/Mortgage');

      // Mock specific category response
      const mockCategory = {
        data: {
          category: mockCategories.data.category_groups[0].categories[0],
        },
      };

      mockYnabAPI.categories.getCategoryById.mockResolvedValue(mockCategory);

      // Test specific category retrieval
      const getResult = await executeToolCall(server, 'ynab:get_category', {
        budget_id: budgetId,
        category_id: 'category-1',
      });
      validateToolResult(getResult);

      const category = parseToolResult(getResult);
      expect(category.category.id).toBe('category-1');
      expect(category.category.name).toBe('Rent/Mortgage');
      expect(category.category.budgeted).toBe(150000);

      // Mock category update
      const updatedCategory = {
        ...mockCategories.data.category_groups[0].categories[0],
        budgeted: 160000, // $160.00
      };

      const mockUpdateResponse = {
        data: {
          category: updatedCategory,
        },
      };

      mockYnabAPI.categories.updateMonthCategory.mockResolvedValue(mockUpdateResponse);

      // Test category budget update
      const updateResult = await executeToolCall(server, 'ynab:update_category', {
        budget_id: budgetId,
        category_id: 'category-1',
        budgeted: 160000,
      });
      validateToolResult(updateResult);

      const updated = parseToolResult(updateResult);
      expect(updated.category.budgeted).toBe(160000);

      // Verify API calls
      expect(mockYnabAPI.categories.getCategories).toHaveBeenCalledWith(budgetId);
      expect(mockYnabAPI.categories.getCategoryById).toHaveBeenCalledWith(budgetId, 'category-1');
      expect(mockYnabAPI.categories.updateMonthCategory).toHaveBeenCalled();
    });
  });

  describe('Complete Utility Tools Integration', () => {
    it('should handle user information retrieval', async () => {
      // Mock user response
      const mockUser = {
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      };

      mockYnabAPI.user.getUser.mockResolvedValue(mockUser);

      // Test user retrieval
      const userResult = await executeToolCall(server, 'ynab:get_user');
      validateToolResult(userResult);

      const user = parseToolResult(userResult);
      expect(user.user.id).toBe('user-123');

      expect(mockYnabAPI.user.getUser).toHaveBeenCalledTimes(1);
    });

    it('should handle amount conversion', async () => {
      // Test dollar to milliunits conversion
      const toMilliunitsResult = await executeToolCall(server, 'ynab:convert_amount', {
        amount: 25.75,
        to_milliunits: true,
      });
      validateToolResult(toMilliunitsResult);

      const toMilli = parseToolResult(toMilliunitsResult);
      expect(toMilli.conversion.converted_amount).toBe(25750);
      expect(toMilli.conversion.description).toBe('$25.75 = 25750 milliunits');

      // Test milliunits to dollar conversion
      const toDollarsResult = await executeToolCall(server, 'ynab:convert_amount', {
        amount: 25750,
        to_milliunits: false,
      });
      validateToolResult(toDollarsResult);

      const dollars = parseToolResult(toDollarsResult);
      expect(dollars.conversion.converted_amount).toBe(25.75);
      expect(dollars.conversion.description).toBe('25750 milliunits = $25.75');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle various API error scenarios', async () => {
      // Test 401 Unauthorized
      const authError = new Error('Unauthorized');
      (authError as any).error = { id: '401', name: 'unauthorized', description: 'Unauthorized' };
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(authError);

      try {
        await executeToolCall(server, 'ynab:list_budgets');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Test 404 Not Found
      const notFoundError = new Error('Not Found');
      (notFoundError as any).error = {
        id: '404.2',
        name: 'not_found',
        description: 'Budget not found',
      };
      mockYnabAPI.budgets.getBudgetById.mockRejectedValue(notFoundError);

      try {
        await executeToolCall(server, 'ynab:get_budget', { budget_id: 'invalid' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Test 429 Rate Limit
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as any).error = {
        id: '429',
        name: 'rate_limit',
        description: 'Rate limit exceeded',
      };
      mockYnabAPI.accounts.getAccounts.mockRejectedValue(rateLimitError);

      try {
        await executeToolCall(server, 'ynab:list_accounts', { budget_id: 'test' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should validate input parameters', async () => {
      // Test missing required parameters
      try {
        await executeToolCall(server, 'ynab:get_budget', {});
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Test invalid parameter types
      try {
        await executeToolCall(server, 'ynab:create_transaction', {
          budget_id: 'test',
          account_id: 'test',
          amount: 'invalid-amount', // Should be number
          date: '2024-01-01',
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
