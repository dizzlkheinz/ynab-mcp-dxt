import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import { handleListBudgets } from '../../tools/budgetTools.js';
import { handleListAccounts } from '../../tools/accountTools.js';
import { handleListTransactions } from '../../tools/transactionTools.js';
import { handleListCategories } from '../../tools/categoryTools.js';
import { handleListPayees } from '../../tools/payeeTools.js';
import { handleListMonths } from '../../tools/monthTools.js';
import { handleGetUser } from '../../tools/utilityTools.js';

// Mock the YNAB API
vi.mock('ynab');

describe('Error Handler Integration Tests', () => {
  let mockYnabAPI: any;

  beforeEach(() => {
    mockYnabAPI = {
      budgets: {
        getBudgets: vi.fn(),
      },
      accounts: {
        getAccounts: vi.fn(),
      },
      transactions: {
        getTransactions: vi.fn(),
      },
      categories: {
        getCategories: vi.fn(),
      },
      payees: {
        getPayees: vi.fn(),
      },
      months: {
        getBudgetMonths: vi.fn(),
      },
      user: {
        getUser: vi.fn(),
      },
    };
  });

  describe('401 Unauthorized Errors', () => {
    it('should handle 401 errors in budget tools', async () => {
      const error = new Error('Request failed with status 401 Unauthorized');
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(error);

      const result = await handleListBudgets(mockYnabAPI);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(401);
      expect(parsed.error.message).toContain('Invalid or expired YNAB access token');
    });

    it('should handle 401 errors in account tools', async () => {
      const error = new Error('401 - Unauthorized access');
      mockYnabAPI.accounts.getAccounts.mockRejectedValue(error);

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'test-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(401);
      expect(parsed.error.message).toContain('Invalid or expired YNAB access token');
    });

    it('should handle 401 errors in transaction tools', async () => {
      const error = new Error('Unauthorized - 401');
      mockYnabAPI.transactions.getTransactions.mockRejectedValue(error);

      const result = await handleListTransactions(mockYnabAPI, { budget_id: 'test-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(401);
      expect(parsed.error.message).toContain('Invalid or expired YNAB access token');
    });
  });

  describe('403 Forbidden Errors', () => {
    it('should handle 403 errors in category tools', async () => {
      const error = new Error('403 Forbidden - insufficient permissions');
      mockYnabAPI.categories.getCategories.mockRejectedValue(error);

      const result = await handleListCategories(mockYnabAPI, { budget_id: 'test-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(403);
      expect(parsed.error.message).toContain('Insufficient permissions');
    });

    it('should handle 403 errors in payee tools', async () => {
      const error = new Error('Request forbidden: 403');
      mockYnabAPI.payees.getPayees.mockRejectedValue(error);

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'test-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(403);
      expect(parsed.error.message).toContain('Insufficient permissions');
    });
  });

  describe('404 Not Found Errors', () => {
    it('should handle 404 errors in month tools', async () => {
      const error = new Error('Budget not found - 404');
      mockYnabAPI.months.getBudgetMonths.mockRejectedValue(error);

      const result = await handleListMonths(mockYnabAPI, { budget_id: 'invalid-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(404);
      expect(parsed.error.message).toContain('Budget or month not found');
    });
  });

  describe('429 Rate Limit Errors', () => {
    it('should handle 429 errors in utility tools', async () => {
      const error = new Error('Too many requests - 429');
      mockYnabAPI.user.getUser.mockRejectedValue(error);

      const result = await handleGetUser(mockYnabAPI);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(429);
      expect(parsed.error.message).toContain('Rate limit exceeded');
    });
  });

  describe('500 Internal Server Errors', () => {
    it('should handle 500 errors consistently across tools', async () => {
      const error = new Error('Internal server error - 500');
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(error);

      const result = await handleListBudgets(mockYnabAPI);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe(500);
      expect(parsed.error.message).toContain('YNAB service is currently unavailable');
    });
  });

  describe('Network and Connection Errors', () => {
    it('should handle network timeout errors', async () => {
      const error = new Error('Network timeout');
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(error);

      const result = await handleListBudgets(mockYnabAPI);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe('UNKNOWN_ERROR');
      expect(parsed.error.message).toContain('Failed to list budgets');
    });

    it('should handle connection refused errors', async () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      mockYnabAPI.accounts.getAccounts.mockRejectedValue(error);

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'test-budget' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.code).toBe('UNKNOWN_ERROR');
      expect(parsed.error.message).toContain('Failed to list accounts');
    });
  });

  describe('Error Response Structure', () => {
    it('should maintain consistent error response structure across all tools', async () => {
      const error = new Error('Test error');
      const tools = [
        () => handleListBudgets(mockYnabAPI),
        () => handleListAccounts(mockYnabAPI, { budget_id: 'test' }),
        () => handleListTransactions(mockYnabAPI, { budget_id: 'test' }),
        () => handleListCategories(mockYnabAPI, { budget_id: 'test' }),
        () => handleListPayees(mockYnabAPI, { budget_id: 'test' }),
        () => handleListMonths(mockYnabAPI, { budget_id: 'test' }),
        () => handleGetUser(mockYnabAPI),
      ];

      // Mock all API calls to reject
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(error);
      mockYnabAPI.accounts.getAccounts.mockRejectedValue(error);
      mockYnabAPI.transactions.getTransactions.mockRejectedValue(error);
      mockYnabAPI.categories.getCategories.mockRejectedValue(error);
      mockYnabAPI.payees.getPayees.mockRejectedValue(error);
      mockYnabAPI.months.getBudgetMonths.mockRejectedValue(error);
      mockYnabAPI.user.getUser.mockRejectedValue(error);

      for (const tool of tools) {
        const result = await tool();

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveProperty('error');
        expect(parsed.error).toHaveProperty('code');
        expect(parsed.error).toHaveProperty('message');
      }
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should sanitize sensitive data in error messages across all tools', async () => {
      // Create a YNABAPIError with sensitive data in the original error
      const originalError = new Error(
        'Authentication failed with token: abc123xyz and key: secret456',
      );
      const ynabError = new (await import('../../server/errorHandler.js')).YNABAPIError(
        401,
        'Test error',
        originalError,
      );
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(ynabError);

      const result = await handleListBudgets(mockYnabAPI);
      const parsed = JSON.parse(result.content[0].text);

      // Should not contain the actual sensitive values
      expect(result.content[0].text).not.toContain('abc123xyz');
      expect(result.content[0].text).not.toContain('secret456');

      // Should contain sanitized versions if details are present
      if (parsed.error.details) {
        expect(parsed.error.details).toContain('token=***');
        expect(parsed.error.details).toContain('key=***');
      }
    });
  });
});
